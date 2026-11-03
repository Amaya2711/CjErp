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
   CJ INTELLIGENCE - PRUEBA FUNCIONAL (script 22). NO EJECUTADA. Ejecutar como administrador, DESPUES de 18 y 19.

   QUE ESCRIBE: unicamente filas nuevas en IA_Conversacion, IA_ConversacionEstado, IA_Turno, IA_Mensaje e
   IA_ResultadoConsulta, dentro de conversaciones CREADAS POR ESTA EJECUCION. No inserta en IA_AuditoriaConsulta, no
   toca datos del ERP y NO llama a sp_IA_Planilla_Buscar (las pruebas del envoltorio usan @SoloValidar = 1: el procedimiento valida y vuelve SIN llamarlo).

   USUARIOS: no se asume ninguno. Se eligen en tiempo de ejecucion dos usuarios REALES y activos (dbo.Usuario, IdEstado = 1)
   solo como propietarios temporales de las conversaciones de prueba. Si no hay candidatos para una prueba, esa prueba
   sale OMITIDA (no cuenta como FALLA, pero debe revisarse). Las conversaciones existen unos segundos: ejecutar fuera de
   horario para que ningun usuario real las vea en su listado.

   LIMPIEZA: SOLO por los IdConversacion (GUID) que esta ejecucion creo, de hijas a padres (resultados, mensajes, turnos,
   estado, conversacion). NUNCA por usuario, fecha ni patron. Si el script se interrumpe antes de limpiar, la lista de
   GUID creados se imprime al inicio de cada creacion (PRINT) para limpiarlos a mano; no hay otros efectos.

   IDENTIDAD PERMANENTE: crear conversaciones registra la identidad de los propietarios temporales en IA_IdentidadUsuario. Al inicio se toma
   una FOTO de las identidades existentes; la limpieza elimina SOLO las que esta ejecucion creo (no estaban en la foto). La seccion G simula
   un login reutilizado cambiando la huella de una identidad CREADA POR ESTA EJECUCION (nunca la de un usuario real que ya usaba el modulo:
   si el propietario tenia identidad o conversaciones previas, la seccion se OMITE). No modifica dbo.Usuario.

   Consume valores de IDENTITY (huecos): inevitable y sin efecto funcional.
   ============================================================================ */
SET NOCOUNT ON;

-- 0. PRE-CHEQUEOS (abortan sin escribir)
IF OBJECT_ID('dbo.IA_Turno', 'U') IS NULL OR OBJECT_ID('dbo.sp_IA_Cj_Turno_Iniciar', 'P') IS NULL OR OBJECT_ID('dbo.sp_IA_Cj_Autorizacion_Alcance', 'P') IS NULL OR OBJECT_ID('dbo.IA_IdentidadUsuario', 'U') IS NULL
    THROW 51300, 'Faltan objetos de los scripts 18/19: no se ejecuta la prueba.', 1;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.IA_Conversacion') AND name <> 'FK_IA_Conversacion_Identidad')
    THROW 51301, 'IA_Conversacion tiene relaciones no previstas: revisar antes de escribir datos de prueba.', 1;

DECLARE @res TABLE (Orden INT IDENTITY(1,1), Prueba VARCHAR(120), Esperado VARCHAR(400), Obtenido VARCHAR(400), Omitida BIT NOT NULL DEFAULT 0);
DECLARE @creadas TABLE (IdConversacion UNIQUEIDENTIFIER PRIMARY KEY);
DECLARE @identPrevias TABLE (IdIdentidad UNIQUEIDENTIFIER PRIMARY KEY);   -- foto: identidades que ya existian
INSERT @identPrevias SELECT IdIdentidad FROM dbo.IA_IdentidadUsuario;

-- Usuarios reales y activos, solo como propietarios temporales
-- propietarios con huella valida (IdEmpleado > 0): sin ella la identidad permanente los deniega por diseno
DECLARE @U NVARCHAR(50) = (SELECT MIN(IdUsuario) FROM dbo.Usuario WHERE IdEstado = 1 AND IdEmpleado > 0);
DECLARE @Otro NVARCHAR(50) = (SELECT MIN(IdUsuario) FROM dbo.Usuario WHERE IdEstado = 1 AND IdEmpleado > 0 AND IdUsuario > @U);
IF @U IS NULL OR @Otro IS NULL THROW 51302, 'No hay dos usuarios activos para la prueba.', 1;

-- Candidatos para las pruebas de alcance (derivados de datos reales; ninguno se asume)
CREATE TABLE #perm (IdUsuario NVARCHAR(50) PRIMARY KEY, Nivel INT, Globales INT);
INSERT #perm
SELECT u.IdUsuario, ISNULL(MAX(CASE t.ScopeLevel WHEN 'TOTAL' THEN 3 WHEN 'EQUIPO' THEN 2 WHEN 'PROPIO' THEN 1 END), 0), ISNULL(MAX(CAST(t.PermiteTotalesGlobales AS INT)), 0)
FROM dbo.Usuario u
LEFT JOIN dbo.SegUsuarioPerfilRol upr ON upr.IdUsuario = u.IdUsuario AND upr.EsActivo = 1
LEFT JOIN dbo.SegPerfilRol pr ON pr.IdPerfilRol = upr.IdPerfilRol AND pr.EsActivo = 1
LEFT JOIN dbo.SegPerfil p ON p.IdPerfil = pr.IdPerfil AND p.EsActivo = 1
LEFT JOIN dbo.SegRol r ON r.IdRol = pr.IdRol AND r.EsActivo = 1
LEFT JOIN dbo.IaToolPermiso t ON t.IdPerfilRol = pr.IdPerfilRol AND t.ToolName = 'buscar_planilla' AND t.EsActivo = 1 AND p.IdPerfil IS NOT NULL AND r.IdRol IS NOT NULL
WHERE u.IdEmpleado > 0     -- huella valida: los demas logins los deniega la identidad permanente (se prueban aparte en la seccion G)
GROUP BY u.IdUsuario;

CREATE TABLE #emp (IdUsuario NVARCHAR(50) PRIMARY KEY, IdEmpleadoCj INT, Cantidad INT);   -- empleados distintos por usuario
INSERT #emp
SELECT u.IdUsuario, MIN(cj.IdEmpleado), COUNT(DISTINCT cj.IdEmpleado)
FROM dbo.Usuario u LEFT JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
GROUP BY u.IdUsuario;

DECLARE @uPropio NVARCHAR(50) = (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 1 JOIN #emp em ON em.IdUsuario = pe.IdUsuario AND em.Cantidad = 1 AND em.IdEmpleadoCj > 0 WHERE pe.Nivel = 1 AND pe.Globales = 0 ORDER BY pe.IdUsuario);
DECLARE @uEquipo NVARCHAR(50) = (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 1 JOIN #emp em ON em.IdUsuario = pe.IdUsuario AND em.Cantidad = 1 AND em.IdEmpleadoCj > 0 WHERE pe.Nivel = 2 AND pe.Globales = 0 ORDER BY pe.IdUsuario);
DECLARE @uTotal NVARCHAR(50) = (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 1 WHERE pe.Nivel = 3 AND pe.Globales = 0 ORDER BY pe.IdUsuario);
DECLARE @uSinPermiso NVARCHAR(50) = (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 1 WHERE pe.Nivel = 0 ORDER BY pe.IdUsuario);
DECLARE @uSinEmpleado NVARCHAR(50) = (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 1 JOIN #emp em ON em.IdUsuario = pe.IdUsuario AND em.Cantidad <> 1 WHERE pe.Nivel IN (1, 2) ORDER BY pe.IdUsuario);

-- Usuarios elegidos (nombres de usuario, no secretos): sirven para repetir las pruebas del script 23 con los mismos datos
PRINT 'Propietarios temporales: A=' + @U + ' B=' + @Otro;
PRINT 'Candidatos de alcance: PROPIO=' + ISNULL(@uPropio, '(ninguno)') + ' EQUIPO=' + ISNULL(@uEquipo, '(ninguno)')
    + ' TOTAL_sin_globales=' + ISNULL(@uTotal, '(ninguno)') + ' sin_permiso=' + ISNULL(@uSinPermiso, '(ninguno)');

DECLARE @x TABLE (IdConversacion UNIQUEIDENTIFIER);
DECLARE @t TABLE (Resultado VARCHAR(30), IdTurno BIGINT, Intentos TINYINT, IdMensajeUsuario BIGINT, SecuenciaUsuario INT,
                  ContenidoUsuario NVARCHAR(MAX), IdMensajeAsistente BIGINT, SecuenciaAsistente INT, ContenidoAsistente NVARCHAR(MAX),
                  IdConversacion UNIQUEIDENTIFIER);
DECLARE @ren TABLE (Renovado INT);
DECLARE @fa TABLE (Filas INT);
DECLARE @co TABLE (Resultado VARCHAR(30), IdMensaje BIGINT, Secuencia INT, Contenido NVARCHAR(MAX));
DECLARE @es TABLE (Filas INT, Motivo VARCHAR(20), Version INT);
DECLARE @el TABLE (Eliminadas INT);
DECLARE @ac TABLE (Actualizadas INT);
DECLARE @li TABLE (IdConversacion UNIQUEIDENTIFIER, Titulo NVARCHAR(250), Modulo VARCHAR(30), FechaCreacion DATETIME2, FechaUltimoMensaje DATETIME2);

DECLARE @c UNIQUEIDENTIFIER, @c2 UNIQUEIDENTIFIER;
DECLARE @own1 UNIQUEIDENTIFIER = NEWID(), @own2 UNIQUEIDENTIFIER = NEWID(), @own3 UNIQUEIDENTIFIER = NEWID();
DECLARE @cm1 UNIQUEIDENTIFIER = NEWID(), @cm2 UNIQUEIDENTIFIER = NEWID(), @cm3 UNIQUEIDENTIFIER = NEWID(), @cm4 UNIQUEIDENTIFIER = NEWID(), @cm5 UNIQUEIDENTIFIER = NEWID();
DECLARE @t1 BIGINT, @t2 BIGINT, @n INT, @v VARCHAR(400), @enc BIT, @en INT, @cTmp BIGINT;

BEGIN TRY
    -- ===================== A. Conversacion principal: idempotencia, bloqueo, recuperacion =====================
    INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @U, @Titulo = NULL, @Modulo = 'PRUEBA';
    SELECT @c = IdConversacion FROM @x; INSERT @creadas VALUES (@c); PRINT 'GUID de prueba creado: ' + CAST(@c AS VARCHAR(40));

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm1, @own1, N'pregunta uno', 120;
    SELECT @v = Resultado, @t1 = IdTurno FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Peticion nueva', 'NUEVO', @v);

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm1, @own2, N'pregunta uno', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Misma peticion mientras la primera sigue viva', 'EN_CURSO', @v);

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm2, @own2, N'pregunta dos', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Peticion distinta con bloqueo vigente', 'CONFLICTO', @v);

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @Otro, @c, @cm2, @own2, N'intruso', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion ajena: Turno_Iniciar', 'NO_ENCONTRADA', @v);

    EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @Otro, @IdConversacion = @c, @Encontrada = @enc OUTPUT;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion ajena: Abrir', '0', CAST(@enc AS VARCHAR(2)));
    EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @c, @Encontrada = @enc OUTPUT;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion propia: Abrir', '1', CAST(@enc AS VARCHAR(2)));

    INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @Otro, @Pagina = 1, @Tamano = 100;
    SELECT @n = COUNT(*) FROM @li WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion ajena: no aparece en Listar', '0', CAST(@n AS VARCHAR(10)));
    DELETE @li; INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @U, @Pagina = 1, @Tamano = 100;
    SELECT @n = COUNT(*) FROM @li WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion propia: aparece en Listar', '1', CAST(@n AS VARCHAR(10)));

    DELETE @el; INSERT @el EXEC dbo.sp_IA_Cj_Conversacion_Eliminar @Otro, @c;
    SELECT @n = Eliminadas FROM @el;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Usuario ajeno no elimina', '0', CAST(@n AS VARCHAR(10)));
    DELETE @el; INSERT @el EXEC dbo.sp_IA_Cj_Conversacion_Eliminar @U, @c;
    SELECT @n = Eliminadas FROM @el;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('No elimina con turno en curso', '0', CAST(@n AS VARCHAR(10)));

    BEGIN TRY
        EXEC dbo.sp_IA_Cj_Turno_Completar @t1, @own2, N'respuesta ilegitima';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Completar con propietario ajeno', '51050', 'SIN_ERROR');
    END TRY BEGIN CATCH INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Completar con propietario ajeno', '51050', CAST(ERROR_NUMBER() AS VARCHAR(10))); END CATCH;

    BEGIN TRY
        EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t1, @Propietario = @own2, @Orden = 1, @Herramienta = 'prueba',
             @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Registrar resultado con propietario ajeno', '51050', 'SIN_ERROR');
    END TRY BEGIN CATCH INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Registrar resultado con propietario ajeno', '51050', CAST(ERROR_NUMBER() AS VARCHAR(10))); END CATCH;

    EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t1, @Propietario = @own1, @Orden = 1, @Herramienta = 'prueba',
         @ArgumentosJson = N'{"k":1}', @AlcanceNivel = 'PROPIO', @Estado = 'OK', @Filas = 3, @FilasEnviadas = 3;
    EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t1, @Propietario = @own1, @Orden = 2, @Herramienta = 'prueba2',
         @ArgumentosJson = N'{"k":2}', @AlcanceNivel = 'PROPIO', @Estado = 'OK', @Filas = 1, @FilasEnviadas = 1;
    SELECT @n = COUNT(*) FROM dbo.IA_ResultadoConsulta WHERE IdTurno = @t1;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Dos herramientas en un turno: dos resultados', '2', CAST(@n AS VARCHAR(10)));

    INSERT @ren EXEC dbo.sp_IA_Cj_Turno_Renovar @t1, @own2, 120; SELECT @n = Renovado FROM @ren;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Renovar con propietario ajeno', '0', CAST(@n AS VARCHAR(10)));
    DELETE @ren; INSERT @ren EXEC dbo.sp_IA_Cj_Turno_Renovar @t1, @own1, 120; SELECT @n = Renovado FROM @ren;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Renovar con propietario', '1', CAST(@n AS VARCHAR(10)));

    INSERT @fa EXEC dbo.sp_IA_Cj_Turno_Fallar @t1, @own2, 'ERROR', N'no deberia aplicar'; SELECT @n = Filas FROM @fa;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallar con propietario ajeno no hace nada', '0', CAST(@n AS VARCHAR(10)));
    SELECT @v = CASE WHEN BloqueoPropietario = @own1 THEN 'CONSERVADO' ELSE 'PERDIDO' END FROM dbo.IA_Conversacion WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo del propietario intacto tras intento ajeno', 'CONSERVADO', @v);

    INSERT @co EXEC dbo.sp_IA_Cj_Turno_Completar @t1, @own1, N'respuesta uno', 'stop', 'modelo-prueba', 10, 5, 100;
    SELECT @v = Resultado FROM @co;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Completar', 'OK', @v);
    DELETE @co; INSERT @co EXEC dbo.sp_IA_Cj_Turno_Completar @t1, @own1, N'respuesta duplicada', 'stop', 'modelo-prueba', 10, 5, 100;
    SELECT @v = Resultado FROM @co;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Completar repetido es idempotente', 'YA_COMPLETADO', @v);
    SELECT @n = COUNT(*) FROM dbo.IA_Mensaje WHERE IdTurno = @t1 AND Rol = 'assistant';
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Un solo mensaje de asistente por turno', '1', CAST(@n AS VARCHAR(10)));
    SELECT @v = CAST(BloqueoPropietario AS VARCHAR(40)) FROM dbo.IA_Conversacion WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo liberado al completar', NULL, @v);

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm1, @own3, N'pregunta uno', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento de peticion completada', 'COMPLETADO', @v);
    SELECT @v = ContenidoAsistente FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Devuelve la respuesta guardada', 'respuesta uno', @v);

    SELECT @v = STRING_AGG(CAST(Secuencia AS VARCHAR(5)), ',') WITHIN GROUP (ORDER BY Secuencia) FROM dbo.IA_Mensaje WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Secuencias de mensajes', '1,2', @v);

    -- Turno interrumpido (caida) y recuperacion
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm2, @own2, N'pregunta dos', 120;
    SELECT @v = Resultado, @t2 = IdTurno FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Segunda peticion nueva', 'NUEVO', @v);
    UPDATE dbo.IA_Conversacion SET BloqueoExpira = DATEADD(MINUTE, -5, SYSUTCDATETIME()) WHERE IdConversacion = @c;   -- simula caida
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm3, @own3, N'pregunta tres', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Peticion nueva tras caida', 'NUEVO', @v);
    SELECT @v = Estado FROM dbo.IA_Turno WHERE IdTurno = @t2;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Turno abandonado queda INTERRUMPIDO', 'INTERRUMPIDO', @v);

    BEGIN TRY
        EXEC dbo.sp_IA_Cj_Turno_Completar @t2, @own2, N'respuesta tardia';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Solicitud antigua no puede completar', '51050', 'SIN_ERROR');
    END TRY BEGIN CATCH INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Solicitud antigua no puede completar', '51050', CAST(ERROR_NUMBER() AS VARCHAR(10))); END CATCH;
    DELETE @fa; INSERT @fa EXEC dbo.sp_IA_Cj_Turno_Fallar @t2, @own2, 'ERROR', N'tardio';
    SELECT @v = CASE WHEN BloqueoPropietario = @own3 THEN 'CONSERVADO' ELSE 'PERDIDO' END FROM dbo.IA_Conversacion WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Solicitud antigua no libera el bloqueo de otra', 'CONSERVADO', @v);

    UPDATE dbo.IA_Conversacion SET BloqueoExpira = DATEADD(MINUTE, -5, SYSUTCDATETIME()) WHERE IdConversacion = @c;
    -- mismo ClientMessageId con OTRO contenido: conflicto (no se reproduce ni se reintenta en silencio)
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm2, @own1, N'texto distinto con el mismo identificador', 120;
    SELECT @v = Resultado, @cTmp = IdTurno FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Mismo ClientMessageId con otro contenido: conflicto', 'CONTENIDO_DISTINTO', @v);
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El conflicto no expone ni toma nada', NULL, CAST(@cTmp AS VARCHAR(20)));
    SELECT @v = CAST(BloqueoPropietario AS VARCHAR(40)) FROM dbo.IA_Conversacion WHERE IdConversacion = @c;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El conflicto no adquiere el bloqueo', CAST(@own3 AS VARCHAR(40)), @v);
    -- mismo ClientMessageId y mismo contenido: reintento legitimo
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cm2, @own1, N'pregunta dos', 120;
    SELECT @v = Resultado + ':' + CAST(Intentos AS VARCHAR(3)) FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento de turno interrumpido', 'REINTENTO:2', @v);
    SELECT @v = ContenidoUsuario FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Se conserva el mensaje original', 'pregunta dos', @v);
    SELECT @n = COUNT(*) FROM dbo.IA_Mensaje WHERE IdTurno = @t2 AND Rol = 'user';
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin mensaje de usuario duplicado', '1', CAST(@n AS VARCHAR(10)));

    -- ===================== B. Bloqueo perdido: nada se guarda (expirado sin relevo, y con relevo) =====================
    INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @U, @Titulo = NULL, @Modulo = 'PRUEBA';
    SELECT @c2 = IdConversacion FROM @x WHERE IdConversacion NOT IN (SELECT IdConversacion FROM @creadas);
    INSERT @creadas VALUES (@c2); PRINT 'GUID de prueba creado: ' + CAST(@c2 AS VARCHAR(40));

    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c2, @cm4, @own1, N'pregunta de bloqueo', 120;
    SELECT @t1 = IdTurno FROM @t;
    -- B1. el bloqueo EXPIRA y nadie lo toma: la solicitud ya no puede escribir
    UPDATE dbo.IA_Conversacion SET BloqueoExpira = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE IdConversacion = @c2;
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t1, @Propietario = @own1, @Orden = 1, @Herramienta = 'x', @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo expirado: no registra resultados', '51050', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Turno_Completar @t1, @own1, N'tarde'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo expirado: no completa el turno', '51050', CAST(@en AS VARCHAR(10)));
    INSERT @es EXEC dbo.sp_IA_Cj_Estado_Guardar @t1, @own1, 0, N'{"a":1}'; SELECT @v = Motivo FROM @es;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo expirado: no guarda estado', 'BLOQUEO_PERDIDO', @v);
    DELETE @ren; INSERT @ren EXEC dbo.sp_IA_Cj_Turno_Renovar @t1, @own1, 120; SELECT @n = Renovado FROM @ren;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Bloqueo expirado: no se puede renovar', '0', CAST(@n AS VARCHAR(10)));

    -- B2. otra solicitud toma el relevo: el turno viejo queda INTERRUMPIDO y su dueno anterior no puede escribir
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c2, @cm5, @own2, N'pregunta nueva', 120;
    SELECT @v = Resultado, @t2 = IdTurno FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Relevo tras expirar', 'NUEVO', @v);
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t1, @Propietario = @own1, @Orden = 1, @Herramienta = 'x', @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Tras el relevo: el dueno anterior no registra resultados', '51050', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Turno_Completar @t1, @own1, N'tarde'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Tras el relevo: el dueno anterior no completa', '51050', CAST(@en AS VARCHAR(10)));
    DELETE @es; INSERT @es EXEC dbo.sp_IA_Cj_Estado_Guardar @t1, @own1, 0, N'{"a":1}'; SELECT @v = Motivo FROM @es;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Tras el relevo: el dueno anterior no guarda estado', 'BLOQUEO_PERDIDO', @v);
    SELECT @n = COUNT(*) FROM dbo.IA_ResultadoConsulta WHERE IdTurno = @t1;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Ningun resultado se guardo por solicitudes sin bloqueo', '0', CAST(@n AS VARCHAR(10)));
    SELECT @n = COUNT(*) FROM dbo.IA_Mensaje WHERE IdTurno = @t1 AND Rol = 'assistant';
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Ninguna respuesta se guardo por solicitudes sin bloqueo', '0', CAST(@n AS VARCHAR(10)));
    SELECT @v = Estado FROM dbo.IA_Turno WHERE IdTurno = @t1;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Turno del dueno anterior no se completo', 'INTERRUMPIDO', @v);
    SELECT @v = CASE WHEN BloqueoPropietario = @own2 THEN 'CONSERVADO' ELSE 'PERDIDO' END FROM dbo.IA_Conversacion WHERE IdConversacion = @c2;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El bloqueo del nuevo propietario sigue intacto', 'CONSERVADO', @v);
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @t2, @Propietario = @own2, @Orden = 1, @Herramienta = 'x', @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El nuevo propietario si puede registrar resultados', '0', CAST(@en AS VARCHAR(10)));

    -- ===================== C. Alcance derivado en SQL (solo lectura: no consulta Planilla) =====================
    DECLARE @nivel VARCHAR(10), @lista NVARCHAR(MAX), @glob BIT, @esp NVARCHAR(MAX);

    -- C1. PROPIO: la lista sale de la cuenta, nunca del llamador
    IF @uPropio IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Alcance PROPIO deriva el empleado de la cuenta', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT;
        SELECT @esp = CAST(IdEmpleadoCj AS NVARCHAR(20)) FROM #emp WHERE IdUsuario = @uPropio;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alcance PROPIO: nivel', 'PROPIO', @nivel);
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alcance PROPIO: empleados = el de la cuenta', @esp, @lista);
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'buscar_planilla', 'EQUIPO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('PROPIO no puede pedir EQUIPO', '51041', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'buscar_planilla', 'TOTAL', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('PROPIO no puede pedir TOTAL', '51041', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'buscar_planilla', NULL, 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Nivel ausente: no cae a ningun nivel por defecto', '51041', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'buscar_planilla', 'PROPIO', 1, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Totales globales no autorizados', '51043', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uPropio, 'otra_herramienta', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Herramienta sin concesion', '51040', CAST(@en AS VARCHAR(10)));
    END

    -- C2. EQUIPO: titular + subordinados directos; pedir PROPIO da solo el titular
    IF @uEquipo IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Alcance EQUIPO deriva titular + subordinados', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        SELECT @esp = STRING_AGG(CAST(x.id AS NVARCHAR(20)), N',') WITHIN GROUP (ORDER BY x.id)
        FROM (SELECT em.IdEmpleadoCj AS id FROM #emp em WHERE em.IdUsuario = @uEquipo
              UNION SELECT d.IdEmpleadoCj FROM dbo.EmpleadoCjDetalle d JOIN dbo.EmpleadoCj sub ON sub.IdEmpleado = d.IdEmpleadoCj
              WHERE d.IdResponsableCj = (SELECT IdEmpleadoCj FROM #emp WHERE IdUsuario = @uEquipo) AND d.IdEmpleadoCj <> d.IdResponsableCj AND d.IdEmpleadoCj > 0) x;
        EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uEquipo, 'buscar_planilla', 'EQUIPO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alcance EQUIPO: empleados = titular + subordinados', @esp, @lista);
        SELECT @esp = CAST(IdEmpleadoCj AS NVARCHAR(20)) FROM #emp WHERE IdUsuario = @uEquipo;
        EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uEquipo, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('EQUIPO pidiendo PROPIO: solo el titular', @esp, @lista);
    END

    -- C3. TOTAL sin permiso de totales globales
    IF @uTotal IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Alcance TOTAL sin totales globales', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uTotal, 'buscar_planilla', 'TOTAL', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alcance TOTAL: nivel', 'TOTAL', @nivel);
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alcance TOTAL: sin lista de empleados', NULL, @lista);
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uTotal, 'buscar_planilla', 'TOTAL', 1, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('TOTAL sin permiso de totales globales los pide: denegado', '51043', CAST(@en AS VARCHAR(10)));
    END

    -- C4. Identidades que no deben autorizar
    IF @uSinPermiso IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Usuario sin concesion', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uSinPermiso, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Usuario activo sin concesion: denegado', '51040', CAST(@en AS VARCHAR(10)));
    END
    IF @uSinEmpleado IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Usuario cuyo empleado no se resuelve', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uSinEmpleado, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Empleado no resuelto (sin huella valida): denegado por la identidad', '51040', CAST(@en AS VARCHAR(10)));
    END
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance N'__usuario_que_no_existe__', 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Usuario inexistente: denegado', '51040', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance NULL, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Identidad nula: denegado', '51040', CAST(@en AS VARCHAR(10)));

    -- ===================== D. Envoltorio de pagos: falla ANTES de invocar sp_IA_Planilla_Buscar (sin carga) =====================
    IF @uPropio IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Envoltorio de pagos: rechazos', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'TOTAL', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: PROPIO no puede pedir TOTAL', '51041', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = NULL, @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: nivel ausente no cae a TOTAL', '51041', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'PROPIO', @VerTotalesGlobales = 1, @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: totales globales no autorizados', '51043', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2025-01-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: rango mayor a 400 dias', '51045', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'PROPIO', @FechaInicio = NULL, @FechaFin = NULL; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: sin fechas', '51044', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31', @Modo = 'OTRO'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: modo invalido', '51046', CAST(@en AS VARCHAR(10)));
        -- el llamador no puede enviar empleados: el parametro no existe (8145)
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uPropio, @NivelSolicitado = 'PROPIO', @AlcanceEmpleados = N'1,2,3', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: el llamador no puede enviar empleados', '8145', CAST(@en AS VARCHAR(10)));
    END
    IF @uSinPermiso IS NOT NULL
    BEGIN
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uSinPermiso, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Pagos: usuario sin permiso', '51040', CAST(@en AS VARCHAR(10)));
    END

    -- ===================== E. Usuario INACTIVO (IdEstado = 0): denegado en cada operacion, aunque conserve roles y permisos =====================
    -- No se cambia ningun estado en dbo.Usuario: se usa un usuario que YA esta inactivo. Para "retomar conversaciones" se insertan filas
    -- de prueba directamente (conversacion + turno en curso con bloqueo vigente) a nombre de ese usuario; todas se limpian por GUID.
    DECLARE @uInact NVARCHAR(50) = COALESCE(
        (SELECT TOP (1) pe.IdUsuario FROM #perm pe JOIN dbo.Usuario us ON us.IdUsuario = pe.IdUsuario AND us.IdEstado = 0 WHERE pe.Nivel > 0 ORDER BY pe.IdUsuario),
        (SELECT MIN(IdUsuario) FROM dbo.Usuario WHERE IdEstado = 0));
    IF @uInact IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Usuario inactivo: denegacion en cada operacion', 'DISPONIBLE', 'SIN_CANDIDATO', 1);
    ELSE
    BEGIN
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @uInact, 'buscar_planilla', 'PROPIO', 0, @nivel OUTPUT, @lista OUTPUT, @glob OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: alcance denegado aunque tenga concesion', '51040', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @uInact, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: envoltorio de pagos denegado', '51040', CAST(@en AS VARCHAR(10)));
        DELETE @x;
        SET @en = NULL; BEGIN TRY INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @uInact, @Titulo = NULL, @Modulo = 'PRUEBA'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no crea conversaciones', '51010', CAST(@en AS VARCHAR(10)));
        IF @en = 0 INSERT @creadas SELECT IdConversacion FROM @x WHERE IdConversacion NOT IN (SELECT IdConversacion FROM @creadas);
        DELETE @li;
        SET @en = NULL; BEGIN TRY INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @uInact; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no lista conversaciones', '51010', CAST(@en AS VARCHAR(10)));

        -- Conversaciones existentes a nombre de un inactivo y de un activo (control), con un turno en curso y bloqueo vigente
        DECLARE @cI UNIQUEIDENTIFIER = NEWID(), @cA UNIQUEIDENTIFIER = NEWID(), @ownI UNIQUEIDENTIFIER = NEWID(), @ownA UNIQUEIDENTIFIER = NEWID(), @tI BIGINT, @tA BIGINT;
        INSERT @creadas VALUES (@cI), (@cA);
        DECLARE @idInact UNIQUEIDENTIFIER = NEWID();   -- identidad de PRUEBA del inactivo (huella ficticia); la elimina la limpieza (no estaba en la foto)
        INSERT dbo.IA_IdentidadUsuario (IdIdentidad, IdUsuario, IdEmpleado, HuellaDocumento) VALUES (@idInact, @uInact, 1, REPLICATE('0', 64));
        INSERT dbo.IA_Conversacion (IdConversacion, IdUsuario, IdIdentidad, Modulo, BloqueoPropietario, BloqueoExpira) VALUES (@cI, @uInact, @idInact, 'PRUEBA', @ownI, DATEADD(MINUTE, 5, SYSUTCDATETIME()));
        INSERT dbo.IA_Conversacion (IdConversacion, IdUsuario, IdIdentidad, Modulo, BloqueoPropietario, BloqueoExpira) VALUES (@cA, @U, dbo.fn_IA_Cj_IdentidadVigente(@U), 'PRUEBA', @ownA, DATEADD(MINUTE, 5, SYSUTCDATETIME()));
        INSERT dbo.IA_ConversacionEstado (IdConversacion) VALUES (@cI), (@cA);
        INSERT dbo.IA_Turno (IdConversacion, IdUsuario, ClientMessageId, Estado) VALUES (@cI, @uInact, NEWID(), 'PROCESANDO'); SET @tI = SCOPE_IDENTITY();
        INSERT dbo.IA_Turno (IdConversacion, IdUsuario, ClientMessageId, Estado) VALUES (@cA, @U, NEWID(), 'PROCESANDO'); SET @tA = SCOPE_IDENTITY();

        -- Control: el usuario ACTIVO con el mismo montaje SI puede
        DELETE @ren; INSERT @ren EXEC dbo.sp_IA_Cj_Turno_Renovar @tA, @ownA, 120; SELECT @n = Renovado FROM @ren;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Control: usuario activo renueva su turno', '1', CAST(@n AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @tA, @Propietario = @ownA, @Orden = 1, @Herramienta = 'x', @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Control: usuario activo registra resultados', '0', CAST(@en AS VARCHAR(10)));

        -- El INACTIVO, al retomar, no puede abrir, usar, renovar, registrar, guardar estado ni completar
        EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @cI, @Encontrada = @enc OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Conversacion de un inactivo: otro usuario no la abre', '0', CAST(@enc AS VARCHAR(2)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @uInact, @IdConversacion = @cI, @Encontrada = @enc OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no abre su conversacion al retomarla', '51010', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @uInact, @cI, @cm1, @own1, N'retomar', 120; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no inicia turnos al retomar', '51010', CAST(@en AS VARCHAR(10)));
        DELETE @ren; INSERT @ren EXEC dbo.sp_IA_Cj_Turno_Renovar @tI, @ownI, 120; SELECT @n = Renovado FROM @ren;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo con turno en curso: no renueva', '0', CAST(@n AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Resultado_Registrar @IdTurno = @tI, @Propietario = @ownI, @Orden = 1, @Herramienta = 'x', @ArgumentosJson = N'{}', @AlcanceNivel = 'PROPIO', @Estado = 'OK'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo con turno en curso: no registra resultados', '51050', CAST(@en AS VARCHAR(10)));
        DELETE @es; INSERT @es EXEC dbo.sp_IA_Cj_Estado_Guardar @tI, @ownI, 0, N'{"a":1}'; SELECT @v = Motivo FROM @es;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo con turno en curso: no guarda estado', 'BLOQUEO_PERDIDO', @v);
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Turno_Completar @tI, @ownI, N'respuesta'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo con turno en curso: no completa', '51050', CAST(@en AS VARCHAR(10)));
        SELECT @n = (SELECT COUNT(*) FROM dbo.IA_ResultadoConsulta WHERE IdTurno = @tI) + (SELECT COUNT(*) FROM dbo.IA_Mensaje WHERE IdTurno = @tI);
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: nada se guardo', '0', CAST(@n AS VARCHAR(10)));
    END

    -- ===================== F. Idempotencia: ClientMessageId obligatorio, unico por usuario, y primer mensaje sin conversacion =====================
    DECLARE @cmN UNIQUEIDENTIFIER = NEWID(), @oN1 UNIQUEIDENTIFIER = NEWID(), @oN2 UNIQUEIDENTIFIER = NEWID(), @cNueva UNIQUEIDENTIFIER, @tN BIGINT;

    SET @en = NULL; BEGIN TRY DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @U, NULL, @oN1, N'sin identificador', 'PRUEBA', 120; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Primer mensaje sin ClientMessageId se rechaza', '51020', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, NULL, @oN1, N'sin identificador', 120; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Turno sin ClientMessageId se rechaza', '51020', CAST(@en AS VARCHAR(10)));

    -- primer mensaje: crea la conversacion y el turno
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @U, @cmN, @oN1, N'primer mensaje', 'PRUEBA', 120;
    SELECT @v = Resultado, @tN = IdTurno, @cNueva = IdConversacion FROM @t;
    IF @cNueva IS NOT NULL AND NOT EXISTS (SELECT 1 FROM @creadas WHERE IdConversacion = @cNueva) INSERT @creadas VALUES (@cNueva);
    PRINT 'GUID de prueba creado: ' + ISNULL(CAST(@cNueva AS VARCHAR(40)), '(ninguno)');
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Primer mensaje crea conversacion y turno', 'NUEVO', @v);

    -- reintento del primer mensaje (el cliente no recibio el conversationId): misma conversacion, sin duplicados
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @U, @cmN, @oN2, N'primer mensaje', 'PRUEBA', 120;
    SELECT @v = Resultado + ':' + CASE WHEN IdConversacion = @cNueva THEN 'misma' ELSE 'OTRA' END FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento del primer mensaje: misma conversacion', 'EN_CURSO:misma', @v);
    SELECT @n = COUNT(DISTINCT t.IdConversacion) FROM dbo.IA_Turno t WHERE t.IdUsuario = @U AND t.ClientMessageId = @cmN;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento del primer mensaje: una sola conversacion', '1', CAST(@n AS VARCHAR(10)));
    SELECT @n = COUNT(*) FROM dbo.IA_Turno t WHERE t.IdUsuario = @U AND t.ClientMessageId = @cmN;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento del primer mensaje: un solo turno', '1', CAST(@n AS VARCHAR(10)));

    -- mismo identificador con otro contenido, con y sin conversacion: conflicto
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @U, @cmN, @oN2, N'otro texto', 'PRUEBA', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Primer mensaje con el mismo id y otro contenido: conflicto', 'CONTENIDO_DISTINTO', @v);
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @cNueva, @cmN, @oN2, N'otro texto', 120;
    SELECT @v = Resultado FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Mismo id y otro contenido con conversacion: conflicto', 'CONTENIDO_DISTINTO', @v);
    -- mismo identificador en OTRA conversacion del mismo usuario: conflicto (el id es del usuario, no de la conversacion)
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @c, @cmN, @oN2, N'primer mensaje', 120;
    SELECT @v = Resultado, @cTmp = IdTurno FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Mismo id en otra conversacion: conflicto', 'ID_REUTILIZADO', @v);
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El conflicto no expone el turno de la otra conversacion', NULL, CAST(@cTmp AS VARCHAR(20)));
    -- otro usuario con el mismo identificador: es independiente (el id es por usuario)
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @Otro, @cmN, @oN2, N'primer mensaje', 'PRUEBA', 120;
    SELECT @v = Resultado, @cTmp = 0 FROM @t;
    IF EXISTS (SELECT 1 FROM @t WHERE IdConversacion IS NOT NULL AND IdConversacion NOT IN (SELECT IdConversacion FROM @creadas)) INSERT @creadas SELECT IdConversacion FROM @t WHERE IdConversacion NOT IN (SELECT IdConversacion FROM @creadas);
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('El mismo id en otro usuario es independiente', 'NUEVO', @v);

    -- completar y reintentar el primer mensaje: devuelve lo guardado y la misma conversacion
    INSERT @co EXEC dbo.sp_IA_Cj_Turno_Completar @tN, @oN1, N'respuesta al primer mensaje', 'stop', 'modelo-prueba', 1, 1, 1;
    DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_IniciarNueva @U, @cmN, @oN2, N'primer mensaje', 'PRUEBA', 120;
    SELECT @v = Resultado + ':' + CASE WHEN IdConversacion = @cNueva THEN 'misma' ELSE 'OTRA' END + ':' + ISNULL(ContenidoAsistente, '') FROM @t;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reintento tras completar: respuesta guardada, misma conversacion', 'COMPLETADO:misma:respuesta al primer mensaje', @v);

    -- ===================== G. Identidad permanente: primera huella, login reutilizado, CONTINUAR / SEPARAR, auditoria y acceso al historial =====================
    -- Precondicion: el propietario @U nacio en ESTA ejecucion (no estaba en la foto) y todas sus conversaciones son de esta ejecucion.
    -- Las "alteraciones de huella" se hacen SOLO sobre la fila de identidad creada por esta ejecucion; dbo.Usuario no se toca.
    DECLARE @idU UNIQUEIDENTIFIER = (SELECT IdIdentidad FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @U AND Estado = 'VIGENTE');
    DECLARE @idOtro UNIQUEIDENTIFIER = (SELECT IdIdentidad FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @Otro AND Estado = 'VIGENTE');
    DECLARE @empU INT, @docU CHAR(64);
    SELECT @empU = IdEmpleado, @docU = HuellaDocumento FROM dbo.fn_IA_Cj_Huella(@U);
    DECLARE @gOk BIT = CASE WHEN @idU IS NOT NULL AND @idOtro IS NOT NULL AND NOT EXISTS (SELECT 1 FROM @identPrevias WHERE IdIdentidad IN (@idU, @idOtro))
                             AND NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion WHERE IdUsuario = @U AND IdConversacion NOT IN (SELECT IdConversacion FROM @creadas))
                             THEN 1 ELSE 0 END;
    DECLARE @cmG UNIQUEIDENTIFIER = NEWID(), @ownG UNIQUEIDENTIFIER = NEWID();

    -- G1. Primera huella
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Primera huella: Crear registra la identidad con IdEmpleado y documento actuales', '1',
        CAST(CASE WHEN @idU IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad = @idU AND IdEmpleado = @empU AND HuellaDocumento = @docU) THEN 1 ELSE 0 END AS VARCHAR(2)));
    SELECT @n = COUNT(*) FROM dbo.IA_Conversacion WHERE IdUsuario = @U AND IdIdentidad <> @idU;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Todas las conversaciones del login llevan su IdIdentidad', '0', CAST(@n AS VARCHAR(10)));
    SELECT @n = COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @U AND Estado = 'VIGENTE';
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Una sola identidad VIGENTE por login (varias conversaciones)', '1', CAST(@n AS VARCHAR(10)));

    -- G2. Huella ausente: login activo sin huella valida => denegado y NO se crea identidad
    DECLARE @uSinHuella NVARCHAR(50) = (SELECT TOP (1) u.IdUsuario FROM dbo.Usuario u WHERE u.IdEstado = 1 AND NOT EXISTS (SELECT 1 FROM dbo.fn_IA_Cj_Huella(u.IdUsuario)) ORDER BY u.IdUsuario);
    IF @uSinHuella IS NULL
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('Huella ausente: login activo sin huella valida denegado', NULL, NULL, 1);
    ELSE
    BEGIN
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Huella ausente: fn_IA_Cj_UsuarioValido devuelve NULL', 'NULL', ISNULL(dbo.fn_IA_Cj_UsuarioValido(@uSinHuella), 'NULL'));
        SET @en = NULL; BEGIN TRY DELETE @x; INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @uSinHuella, @Titulo = NULL, @Modulo = 'PRUEBA'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Huella ausente: no puede crear conversaciones', '51010', CAST(@en AS VARCHAR(10)));
        DECLARE @idTmp UNIQUEIDENTIFIER;
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Asegurar @Login = @uSinHuella, @IdIdentidad = @idTmp OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Huella ausente: no se registra identidad', '51010', CAST(@en AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdUsuario = @uSinHuella;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Huella ausente: ninguna fila de identidad creada', '0', CAST(@n AS VARCHAR(10)));
    END

    IF @gOk = 0
        INSERT @res (Prueba, Esperado, Obtenido, Omitida) VALUES ('G3-G7. Login reutilizado / CONTINUAR / SEPARAR (propietario con uso previo del modulo)', NULL, NULL, 1);
    ELSE
    BEGIN
        DECLARE @cG UNIQUEIDENTIFIER = (SELECT TOP (1) IdConversacion FROM @creadas c WHERE EXISTS (SELECT 1 FROM dbo.IA_Conversacion x WHERE x.IdConversacion = c.IdConversacion AND x.IdUsuario = @U));

        -- G3. Inmutabilidad (disparador): ni IdIdentidad ni IdUsuario cambian por un UPDATE accidental
        SET @en = NULL; BEGIN TRY UPDATE dbo.IA_Conversacion SET IdIdentidad = @idOtro WHERE IdConversacion = @cG; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('IdIdentidad de una conversacion es inmutable', '51080', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY UPDATE dbo.IA_Conversacion SET IdUsuario = @Otro WHERE IdConversacion = @cG; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('IdUsuario solo cambia con sp_IA_Cj_Identidad_Resolver (UPDATE directo rechazado)', '51081', CAST(@en AS VARCHAR(10)));

        -- G4. Mismo login y MISMO documento, otro IdEmpleado (reingreso): bloqueado hasta revision explicita
        UPDATE dbo.IA_IdentidadUsuario SET IdEmpleado = @empU + 900000 WHERE IdIdentidad = @idU;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso (otro IdEmpleado): el login queda denegado', 'NULL', ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));
        SELECT @v = Motivo FROM dbo.vw_IA_Cj_Identidad_Conflicto WHERE IdIdentidad = @idU;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: aparece en la vista de conflictos como EMPLEADO_DISTINTO', 'EMPLEADO_DISTINTO', @v);
        SET @en = NULL; BEGIN TRY DELETE @li; INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @U; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: no lista el historial', '51010', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @cG, @Encontrada = @enc OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: no abre el historial', '51010', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY DELETE @x; INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @U, @Titulo = NULL, @Modulo = 'PRUEBA'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: no crea conversaciones nuevas', '51010', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @cG, @cmG, @ownG, N'intento', 120; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: no inicia turnos', '51010', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @U, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Reingreso: envoltorio de pagos denegado', '51040', CAST(@en AS VARCHAR(10)));

        -- G5. CONTINUAR: validaciones y exito (misma persona = mismo documento)
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'OTRA', @AprobadoPor = N'prueba-22', @Motivo = N'prueba', @Evidencia = N'evidencia de prueba suficiente'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Resolver: accion invalida rechazada', '51070', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = NULL, @Motivo = N'prueba', @Evidencia = N'evidencia de prueba suficiente', @ConfirmaMismaPersona = 1; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Resolver: exige quien aprueba', '51071', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = N'prueba-22', @Motivo = N'prueba', @Evidencia = N'corta', @ConfirmaMismaPersona = 1; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Resolver: exige evidencia suficiente', '51071', CAST(@en AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = N'prueba-22', @Motivo = N'prueba', @Evidencia = N'evidencia de prueba suficiente', @ConfirmaMismaPersona = 0; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CONTINUAR sin confirmar que es la misma persona: rechazado', '51075', CAST(@en AS VARCHAR(10)));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Los rechazos no cambian nada: el login sigue denegado', 'NULL', ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));

        EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = N'prueba-22', @Motivo = N'reingreso con el mismo documento', @Evidencia = N'ficha de RRHH de prueba: mismo documento', @ConfirmaMismaPersona = 1;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CONTINUAR (mismo documento): el login vuelve a ser valido', @U, ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CONTINUAR: la marca de sesion no queda habilitada', 'NULL', ISNULL(CONVERT(VARCHAR(10), SESSION_CONTEXT(N'cjia_resolver')), 'NULL'));
        SET @enc = 0; EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @cG, @Encontrada = @enc OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CONTINUAR: el historial sigue accesible', '1', CAST(@enc AS VARCHAR(2)));
        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @U AND Accion = 'CONTINUAR' AND IdIdentidadAnterior = @idU AND IdIdentidadPosterior = @idU
            AND AdminSql = ORIGINAL_LOGIN() AND AprobadoPor = N'prueba-22' AND Motivo = N'reingreso con el mismo documento' AND Evidencia LIKE N'ficha de RRHH%'
            AND IdEmpleadoAnterior = @empU + 900000 AND IdEmpleadoPosterior = @empU AND HuellaDocAnterior = @docU AND HuellaDocPosterior = @docU;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Auditoria de CONTINUAR: administrador, aprobador, motivo, evidencia y valores antes/despues', '1', CAST(@n AS VARCHAR(10)));
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = N'prueba-22', @Motivo = N'repetido', @Evidencia = N'evidencia de prueba suficiente', @ConfirmaMismaPersona = 1; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Resolver sin conflicto no hace nada', '51073', CAST(@en AS VARCHAR(10)));

        -- G6. MISMO IdEmpleado, OTRO documento (otra persona con el mismo login e identificador reutilizado): CONTINUAR rechazado, solo SEPARAR
        UPDATE dbo.IA_IdentidadUsuario SET HuellaDocumento = REPLICATE('A', 64) WHERE IdIdentidad = @idU;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Mismo IdEmpleado y otro documento: el login queda denegado', 'NULL', ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));
        SELECT @v = Motivo FROM dbo.vw_IA_Cj_Identidad_Conflicto WHERE IdIdentidad = @idU;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Mismo IdEmpleado y otro documento: vista de conflictos DOCUMENTO_DISTINTO', 'DOCUMENTO_DISTINTO', @v);
        SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'CONTINUAR', @AprobadoPor = N'prueba-22', @Motivo = N'intento', @Evidencia = N'evidencia de prueba suficiente', @ConfirmaMismaPersona = 1; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Documento distinto: CONTINUAR rechazado aunque se confirme', '51074', CAST(@en AS VARCHAR(10)));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Documento distinto: el rechazo no devuelve el acceso', 'NULL', ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));

        -- G7. SEPARAR: otra persona. El historial se archiva y NINGUNA via lo devuelve al login
        EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'SEPARAR', @AprobadoPor = N'prueba-22', @Motivo = N'otra persona', @Evidencia = N'documento distinto en RRHH de prueba', @ConfirmaMismaPersona = 0;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: el login vuelve a ser valido (identidad nueva)', @U, ISNULL(dbo.fn_IA_Cj_UsuarioValido(@U), 'NULL'));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: la marca de sesion no queda habilitada', 'NULL', ISNULL(CONVERT(VARCHAR(10), SESSION_CONTEXT(N'cjia_resolver')), 'NULL'));
        DECLARE @idNueva UNIQUEIDENTIFIER = dbo.fn_IA_Cj_IdentidadVigente(@U);
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: la identidad vigente es otra', '1', CAST(CASE WHEN @idNueva IS NOT NULL AND @idNueva <> @idU THEN 1 ELSE 0 END AS VARCHAR(2)));
        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad = @idU AND Estado = 'RETIRADA' AND Resolucion = 'SEPARAR';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: la identidad anterior queda RETIRADA', '1', CAST(@n AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_Conversacion WHERE IdConversacion = @cG AND IdIdentidad = @idU AND IdUsuario LIKE N'~retirada:%';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: el historial NO se borro; archivado y con su IdIdentidad original', '1', CAST(@n AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_Turno WHERE IdConversacion = @cG AND IdUsuario LIKE N'~retirada:%';
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: los turnos del historial tambien se archivaron', '1', CAST(CASE WHEN @n >= 1 THEN 1 ELSE 0 END AS VARCHAR(2)));

        -- acceso al historial archivado, DESDE LOS PROCEDIMIENTOS (los que usa la API) y con el mismo login
        SET @enc = 1; EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @cG, @Encontrada = @enc OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Archivado: Abrir no lo encuentra', '0', CAST(@enc AS VARCHAR(2)));
        DELETE @li; INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @U, @Pagina = 1, @Tamano = 100;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Archivado: el listado del login no lo incluye', '0', CAST((SELECT COUNT(*) FROM @li WHERE IdConversacion = @cG) AS VARCHAR(10)));
        DELETE @ac; INSERT @ac EXEC dbo.sp_IA_Cj_Conversacion_Renombrar @IdUsuario = @U, @IdConversacion = @cG, @Titulo = N'secuestrada'; SELECT @n = Actualizadas FROM @ac;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Archivado: Renombrar no actualiza nada', '0', CAST(@n AS VARCHAR(10)));
        DELETE @el; INSERT @el EXEC dbo.sp_IA_Cj_Conversacion_Eliminar @IdUsuario = @U, @IdConversacion = @cG; SELECT @n = Eliminadas FROM @el;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Archivado: Eliminar no elimina nada', '0', CAST(@n AS VARCHAR(10)));
        DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @cG, @cmG, @ownG, N'intento sobre archivado', 120; SELECT @v = Resultado FROM @t;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Archivado: Turno_Iniciar responde NO_ENCONTRADA', 'NO_ENCONTRADA', @v);

        -- ataque de restauracion: aun si alguien devolviera IdUsuario al login (con la marca de sesion), la conversacion sigue siendo de la identidad RETIRADA
        EXEC sp_set_session_context @key = N'cjia_resolver', @value = 1;
        UPDATE dbo.IA_Conversacion SET IdUsuario = @U WHERE IdConversacion = @cG;
        EXEC sp_set_session_context @key = N'cjia_resolver', @value = NULL;
        SET @enc = 1; EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @U, @IdConversacion = @cG, @Encontrada = @enc OUTPUT;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Restauracion forzada de IdUsuario: Abrir sigue sin encontrarla (IdIdentidad RETIRADA)', '0', CAST(@enc AS VARCHAR(2)));
        DELETE @li; INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @U, @Pagina = 1, @Tamano = 100;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Restauracion forzada: el listado no la incluye', '0', CAST((SELECT COUNT(*) FROM @li WHERE IdConversacion = @cG) AS VARCHAR(10)));
        DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @cG, @cmG, @ownG, N'intento sobre archivado', 120; SELECT @v = Resultado FROM @t;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Restauracion forzada: Turno_Iniciar responde NO_ENCONTRADA', 'NO_ENCONTRADA', @v);

        -- el login arranca vacio y puede crear conversaciones nuevas, ligadas a la identidad nueva
        DELETE @x; INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @U, @Titulo = NULL, @Modulo = 'PRUEBA';
        INSERT @creadas SELECT IdConversacion FROM @x WHERE IdConversacion NOT IN (SELECT IdConversacion FROM @creadas);
        SELECT @n = COUNT(*) FROM dbo.IA_Conversacion c JOIN @x x ON x.IdConversacion = c.IdConversacion WHERE c.IdIdentidad = @idNueva AND c.IdUsuario = @U;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SEPARAR: las conversaciones nuevas llevan la identidad nueva', '1', CAST(@n AS VARCHAR(10)));

        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdUsuario = @U AND Accion = 'SEPARAR' AND IdIdentidadAnterior = @idU AND IdIdentidadPosterior = @idNueva
            AND AdminSql = ORIGINAL_LOGIN() AND AprobadoPor = N'prueba-22' AND Motivo = N'otra persona' AND Evidencia LIKE N'documento distinto%'
            AND HuellaDocAnterior = REPLICATE('A', 64) AND HuellaDocPosterior = @docU AND IdEmpleadoPosterior = @empU AND ConversacionesArchivadas >= 1 AND TurnosArchivados >= 1;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Auditoria de SEPARAR: administrador, aprobador, motivo, evidencia, valores antes/despues y filas archivadas', '1', CAST(@n AS VARCHAR(10)));

        -- G8. FALLO FORZADO despues de activar la marca: Resolver debe limpiarla en la MISMA sesion y revertir todo.
        -- Fallo natural y determinista (sin ganchos de prueba en el procedimiento): se prepara un turno ya archivado bajo el propietario
        -- '~retirada:<identidad vigente>' con el mismo ClientMessageId que un turno del login; al archivar, el UPDATE de IA_Turno choca con el
        -- indice unico UX_IA_Turno_Usuario_ClientMessage (2601) DESPUES de haber activado la marca y de haber archivado la conversacion.
        DECLARE @cH UNIQUEIDENTIFIER, @cmH UNIQUEIDENTIFIER = NEWID(), @ownH UNIQUEIDENTIFIER = NEWID(), @cOtroConv UNIQUEIDENTIFIER;
        DELETE @x; INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @U, @Titulo = NULL, @Modulo = 'PRUEBA';
        SELECT @cH = IdConversacion FROM @x; INSERT @creadas SELECT @cH WHERE @cH NOT IN (SELECT IdConversacion FROM @creadas);
        DELETE @t; INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @U, @cH, @cmH, @ownH, N'turno del fallo forzado', 120;
        SELECT @cOtroConv = MIN(IdConversacion) FROM dbo.IA_Conversacion WHERE IdUsuario = @Otro AND IdConversacion IN (SELECT IdConversacion FROM @creadas);
        INSERT dbo.IA_Turno (IdConversacion, IdUsuario, ClientMessageId, Estado)
        VALUES (@cOtroConv, N'~retirada:' + LOWER(CONVERT(NVARCHAR(36), @idNueva)), @cmH, 'ERROR');            -- fila de prueba; la limpia la limpieza por conversacion
        UPDATE dbo.IA_IdentidadUsuario SET HuellaDocumento = REPLICATE('B', 64) WHERE IdIdentidad = @idNueva;     -- crea un conflicto (otro documento)

        SET @en = NULL;
        BEGIN TRY EXEC dbo.sp_IA_Cj_Identidad_Resolver @IdUsuario = @U, @Accion = 'SEPARAR', @AprobadoPor = N'prueba-22', @Motivo = N'fallo forzado', @Evidencia = N'evidencia de prueba suficiente (fallo forzado)'; SET @en = 0; END TRY
        BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado tras activar la marca: Resolver propaga el error original (indice unico)', '2601', CAST(@en AS VARCHAR(10)));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: la marca de sesion NO queda habilitada en la misma sesion', 'NULL', ISNULL(CONVERT(VARCHAR(10), SESSION_CONTEXT(N'cjia_resolver')), 'NULL'));
        SET @en = NULL; BEGIN TRY UPDATE dbo.IA_Conversacion SET IdUsuario = @Otro WHERE IdConversacion = @cH; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: un UPDATE directo de IdUsuario sigue rechazado (51081)', '51081', CAST(@en AS VARCHAR(10)));
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: no queda transaccion abierta', '0', CAST(@@TRANCOUNT AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_Conversacion WHERE IdConversacion = @cH AND IdUsuario = @U AND IdIdentidad = @idNueva;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: el archivado se revirtio (la conversacion sigue siendo del login)', '1', CAST(@n AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad = @idNueva AND Estado = 'VIGENTE' AND Resolucion IS NULL;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: la identidad no cambio de estado', '1', CAST(@n AS VARCHAR(10)));
        SELECT @n = COUNT(*) FROM dbo.IA_IdentidadAuditoria WHERE IdIdentidadAnterior = @idNueva;
        INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Fallo forzado: no se registro auditoria de una resolucion que no ocurrio', '0', CAST(@n AS VARCHAR(10)));
    END
END TRY
BEGIN CATCH
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('ERROR INESPERADO EN LA PRUEBA', 'sin error', LEFT(CAST(ERROR_NUMBER() AS VARCHAR(10)) + ': ' + ERROR_MESSAGE(), 300));
END CATCH;

-- ===================== LIMPIEZA: solo lo creado por esta ejecucion (por IdConversacion), de hijas a padres =====================
DELETE r FROM dbo.IA_ResultadoConsulta r WHERE r.IdConversacion IN (SELECT IdConversacion FROM @creadas);
DELETE m FROM dbo.IA_Mensaje m WHERE m.IdConversacion IN (SELECT IdConversacion FROM @creadas);
DELETE t FROM dbo.IA_Turno t WHERE t.IdConversacion IN (SELECT IdConversacion FROM @creadas);
DELETE e FROM dbo.IA_ConversacionEstado e WHERE e.IdConversacion IN (SELECT IdConversacion FROM @creadas);
DELETE c FROM dbo.IA_Conversacion c WHERE c.IdConversacion IN (SELECT IdConversacion FROM @creadas);

-- Identidades: SOLO las creadas por esta ejecucion (no estaban en la foto) y solo si su propietario ya no tiene conversaciones
DELETE i FROM dbo.IA_IdentidadUsuario i
WHERE i.IdIdentidad NOT IN (SELECT IdIdentidad FROM @identPrevias)
  AND NOT EXISTS (SELECT 1 FROM dbo.IA_Conversacion c WHERE c.IdUsuario = i.IdUsuario);

-- Auditoria de identidad: SOLO las filas que esta ejecucion genero (sobre identidades que no estaban en la foto)
DELETE a FROM dbo.IA_IdentidadAuditoria a WHERE a.IdIdentidadAnterior NOT IN (SELECT IdIdentidad FROM @identPrevias) OR a.IdIdentidadPosterior NOT IN (SELECT IdIdentidad FROM @identPrevias);

DECLARE @restos INT =
    (SELECT COUNT(*) FROM dbo.IA_Conversacion WHERE IdConversacion IN (SELECT IdConversacion FROM @creadas))
  + (SELECT COUNT(*) FROM dbo.IA_Turno WHERE IdConversacion IN (SELECT IdConversacion FROM @creadas))
  + (SELECT COUNT(*) FROM dbo.IA_Mensaje WHERE IdConversacion IN (SELECT IdConversacion FROM @creadas))
  + (SELECT COUNT(*) FROM dbo.IA_ResultadoConsulta WHERE IdConversacion IN (SELECT IdConversacion FROM @creadas))
  + (SELECT COUNT(*) FROM dbo.IA_IdentidadUsuario WHERE IdIdentidad NOT IN (SELECT IdIdentidad FROM @identPrevias));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Limpieza: no quedan filas de esta ejecucion', '0', CAST(@restos AS VARCHAR(10)));

DROP TABLE #perm; DROP TABLE #emp;

SELECT Orden, Prueba, Esperado, Obtenido,
       CASE WHEN Omitida = 1 THEN 'OMITIDA' WHEN ISNULL(Esperado, '') = ISNULL(Obtenido, '') THEN 'OK' ELSE 'FALLA' END AS Resultado
FROM @res ORDER BY Orden;
SELECT SUM(CASE WHEN Omitida = 0 AND ISNULL(Esperado, '') <> ISNULL(Obtenido, '') THEN 1 ELSE 0 END) AS Fallas,
       SUM(CASE WHEN Omitida = 1 THEN 1 ELSE 0 END) AS Omitidas, COUNT(*) AS Pruebas FROM @res;
GO

SET NOEXEC OFF;
GO
