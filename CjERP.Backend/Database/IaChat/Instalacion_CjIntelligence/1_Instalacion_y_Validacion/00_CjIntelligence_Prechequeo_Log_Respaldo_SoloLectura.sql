-- SOLO LECTURA. No modifica nada. PRECHEQUEO OBLIGATORIO antes de instalar CJ Intelligence (scripts 18 a 23).
-- Comprueba, con datos de msdb y de la base, que el hallazgo del log (docs/HALLAZGO_RESPALDO_LOG_JC_Db.md) fue atendido y que existe un
-- respaldo completo reciente. La existencia de un PROCEDIMIENTO DE RECUPERACION PROBADO no se puede comprobar desde SQL: se confirma a mano
-- (ver LEEME, paso 0.3). Cada fila: Resultado = OK | INFO | CONFIRMAR | DETENER.
--   DETENER   -> NO continuar con la instalacion hasta resolverlo.
--   CONFIRMAR -> requiere una confirmacion humana escrita antes de continuar.
-- Uso (consola):  sqlcmd -S <servidor> -d JC_Db -U <admin> -i 00_CjIntelligence_Prechequeo_Log_Respaldo_SoloLectura.sql -b
-- (no necesita modo SQLCMD: se puede ejecutar tambien en una ventana normal de SSMS conectada a JC_Db).
-- Permisos necesarios: lectura de msdb.dbo.backupset y VIEW DATABASE STATE (un administrador los tiene).
SET NOCOUNT ON;

IF DB_NAME() <> N'JC_Db'
    THROW 51100, 'Guarda de base: la base activa no es JC_Db. No se ejecuto el prechequeo.', 1;

-- UMBRALES. Los fija el responsable de SQL Server; si los cambia, debe anotarlo en el acta. Valores por defecto prudentes.
DECLARE @MaxHorasDesdeCompleto INT          = 30;     -- el ultimo respaldo completo no debe tener mas de 30 h (hay uno diario)
DECLARE @MaxHorasDesdeLog      INT          = 24;     -- en recuperacion FULL debe existir un respaldo de log de las ultimas 24 h
DECLARE @MaxPctLogUsado        DECIMAL(5,2) = 80.0;   -- el log no debe estar usado por encima de este porcentaje
DECLARE @MinGbLibresVolumenLog DECIMAL(10,2) = 20.0;  -- espacio libre minimo (GB) en el volumen del archivo de log

DECLARE @r TABLE (Orden INT IDENTITY(1,1), Chequeo VARCHAR(100), Valor NVARCHAR(200), Resultado VARCHAR(10), Nota NVARCHAR(400));

-- 1. Estado de la base
DECLARE @state NVARCHAR(60), @recovery NVARCHAR(60), @reuse NVARCHAR(60), @readonly BIT, @useracc NVARCHAR(60);
SELECT @state = state_desc, @recovery = recovery_model_desc, @reuse = log_reuse_wait_desc, @readonly = is_read_only, @useracc = user_access_desc
FROM sys.databases WHERE name = DB_NAME();

INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('Base en linea, escribible y multiusuario', CONCAT(@state, ' / ', CASE WHEN @readonly = 1 THEN 'SOLO LECTURA' ELSE 'lectura-escritura' END, ' / ', @useracc),
        CASE WHEN @state = 'ONLINE' AND @readonly = 0 AND @useracc = 'MULTI_USER' THEN 'OK' ELSE 'DETENER' END, NULL);

INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('Modelo de recuperacion', @recovery, 'INFO', 'FULL exige respaldos de log; SIMPLE no los admite. La decision es del responsable de SQL Server.');

-- 2. Ultimo respaldo completo (msdb)
DECLARE @lastFull DATETIME, @fullDamaged BIT, @lastFullCopyOnly BIT, @horasFull INT;
BEGIN TRY
    SELECT TOP (1) @lastFull = b.backup_finish_date, @fullDamaged = b.is_damaged, @lastFullCopyOnly = b.is_copy_only
    FROM msdb.dbo.backupset b WHERE b.database_name = DB_NAME() AND b.type = 'D' ORDER BY b.backup_finish_date DESC;
    SET @horasFull = DATEDIFF(HOUR, @lastFull, GETDATE());

    INSERT @r (Chequeo, Valor, Resultado, Nota)
    VALUES ('Ultimo respaldo COMPLETO reciente', CONCAT(CONVERT(VARCHAR(19), @lastFull, 120), ' (hace ', @horasFull, ' h; maximo ', @MaxHorasDesdeCompleto, ' h)'),
            CASE WHEN @lastFull IS NOT NULL AND @horasFull <= @MaxHorasDesdeCompleto THEN 'OK' ELSE 'DETENER' END,
            CASE WHEN @lastFull IS NULL THEN 'No hay respaldos completos registrados en msdb.' ELSE 'Confirme que el archivo existe y que se puede restaurar (paso 0.3).' END);

    INSERT @r (Chequeo, Valor, Resultado, Nota)
    VALUES ('El ultimo respaldo completo no esta marcado como danado', CASE WHEN @fullDamaged = 1 THEN 'DANADO' ELSE 'no danado' END,
            CASE WHEN @lastFull IS NOT NULL AND ISNULL(@fullDamaged, 1) = 0 THEN 'OK' ELSE 'DETENER' END, NULL);
END TRY
BEGIN CATCH
    INSERT @r (Chequeo, Valor, Resultado, Nota) VALUES ('Lectura de respaldos en msdb', LEFT(ERROR_MESSAGE(), 200), 'DETENER', 'No se pudo leer msdb.dbo.backupset: sin esa evidencia no se debe continuar.');
END CATCH;

-- 3. Respaldos de log (hallazgo del log)
DECLARE @lastLog DATETIME, @horasLog INT, @logs7 INT;
BEGIN TRY
    SELECT @lastLog = MAX(b.backup_finish_date), @logs7 = SUM(CASE WHEN b.backup_finish_date >= DATEADD(DAY, -7, GETDATE()) THEN 1 ELSE 0 END)
    FROM msdb.dbo.backupset b WHERE b.database_name = DB_NAME() AND b.type = 'L';
    SET @horasLog = DATEDIFF(HOUR, @lastLog, GETDATE());

    INSERT @r (Chequeo, Valor, Resultado, Nota)
    VALUES ('Respaldos de log recientes (solo si el modelo es FULL)',
            CASE WHEN @recovery <> 'FULL' THEN 'no aplica (modelo ' + @recovery + ')'
                 ELSE CONCAT('ultimo: ', ISNULL(CONVERT(VARCHAR(19), @lastLog, 120), 'NINGUNO'), '; ultimos 7 dias: ', ISNULL(@logs7, 0), '; maximo ', @MaxHorasDesdeLog, ' h') END,
            CASE WHEN @recovery <> 'FULL' THEN 'INFO'
                 WHEN @lastLog IS NOT NULL AND @horasLog <= @MaxHorasDesdeLog THEN 'OK' ELSE 'DETENER' END,
            CASE WHEN @recovery = 'FULL' AND (@lastLog IS NULL OR @horasLog > @MaxHorasDesdeLog) THEN 'HALLAZGO DEL LOG NO ATENDIDO: en FULL sin respaldos de log el log no se libera.' ELSE NULL END);
END TRY
BEGIN CATCH
    INSERT @r (Chequeo, Valor, Resultado, Nota) VALUES ('Lectura de respaldos de log en msdb', LEFT(ERROR_MESSAGE(), 200), 'DETENER', 'No se pudo leer msdb.dbo.backupset.');
END CATCH;

-- 4. Motivo por el que el log no se libera
INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('log_reuse_wait_desc', @reuse,
        CASE WHEN @reuse = 'NOTHING' THEN 'OK' WHEN @reuse = 'LOG_BACKUP' AND @recovery = 'FULL' THEN 'DETENER' ELSE 'CONFIRMAR' END,
        CASE WHEN @reuse = 'LOG_BACKUP' THEN 'El log espera un respaldo de log (es el hallazgo original).' WHEN @reuse = 'NOTHING' THEN NULL ELSE 'Hay algo reteniendo el log: el responsable debe explicarlo antes de continuar.' END);

-- 5. Uso del log y espacio del volumen
BEGIN TRY
    DECLARE @pct DECIMAL(9,2), @totalMb DECIMAL(18,2), @usedMb DECIMAL(18,2);
    SELECT @pct = used_log_space_in_percent, @totalMb = total_log_size_in_bytes / 1048576.0, @usedMb = used_log_space_in_bytes / 1048576.0
    FROM sys.dm_db_log_space_usage;

    INSERT @r (Chequeo, Valor, Resultado, Nota)
    VALUES ('Uso del log', CONCAT(CONVERT(VARCHAR(30), @usedMb), ' MB de ', CONVERT(VARCHAR(30), @totalMb), ' MB (', CONVERT(VARCHAR(10), @pct), ' %; maximo ', CONVERT(VARCHAR(10), @MaxPctLogUsado), ' %)'),
            CASE WHEN @pct <= @MaxPctLogUsado THEN 'OK' ELSE 'DETENER' END,
            CASE WHEN @pct > @MaxPctLogUsado THEN 'Log casi lleno: no se debe escribir mas hasta liberarlo (respaldo de log o decision del responsable).' ELSE NULL END);

    DECLARE @libresGb DECIMAL(18,2);
    SELECT TOP (1) @libresGb = vs.available_bytes / 1073741824.0
    FROM sys.database_files f CROSS APPLY sys.dm_os_volume_stats(DB_ID(), f.file_id) vs WHERE f.type_desc = 'LOG';

    INSERT @r (Chequeo, Valor, Resultado, Nota)
    VALUES ('Espacio libre en el volumen del log', CONCAT(CONVERT(VARCHAR(30), @libresGb), ' GB libres (minimo ', CONVERT(VARCHAR(10), @MinGbLibresVolumenLog), ' GB)'),
            CASE WHEN @libresGb >= @MinGbLibresVolumenLog THEN 'OK' ELSE 'DETENER' END,
            CASE WHEN @libresGb < @MinGbLibresVolumenLog THEN 'Volumen casi lleno: si se agota, la aplicacion deja de poder escribir.' ELSE NULL END);
END TRY
BEGIN CATCH
    INSERT @r (Chequeo, Valor, Resultado, Nota) VALUES ('Uso del log / espacio del volumen', LEFT(ERROR_MESSAGE(), 200), 'DETENER', 'No se pudo leer las vistas de estado (se requiere VIEW DATABASE STATE).');
END CATCH;

-- 6. Estado de instalacion previa (informativo; el script 18 aborta si hay datos incompatibles)
DECLARE @objCj INT = (SELECT COUNT(*) FROM sys.objects WHERE name LIKE 'sp[_]IA[_]Cj[_]%' OR name LIKE 'fn[_]IA[_]Cj[_]%' OR name LIKE 'vw[_]IA[_]Cj[_]%'
                                                            OR name IN ('IA_Turno', 'IA_ConversacionEstado', 'IA_ResultadoConsulta', 'IA_IdentidadUsuario', 'IA_IdentidadAuditoria'));
INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('Objetos de CJ Intelligence ya existentes', CAST(@objCj AS NVARCHAR(10)), CASE WHEN @objCj = 0 THEN 'OK' ELSE 'CONFIRMAR' END,
        CASE WHEN @objCj = 0 THEN 'Instalacion limpia.' ELSE 'Ya hay una instalacion total o parcial: no continuar sin revisar con el LEEME (reanudar o revertir).' END);

DECLARE @filasIa BIGINT = (SELECT ISNULL(SUM(p.rows), 0) FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
                           WHERE t.name IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta'));
INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('Filas en las tablas base del chat (IA_Conversacion, IA_Mensaje, IA_AuditoriaConsulta)', CAST(@filasIa AS NVARCHAR(30)), CASE WHEN @filasIa = 0 THEN 'OK' ELSE 'DETENER' END,
        CASE WHEN @filasIa = 0 THEN 'Vacias, como se verifico el 2026-11-01 (el script 18 cambia el tipo de IdUsuario solo si estan vacias).' ELSE 'Tienen datos: el script 18 se negaria a cambiar el tipo de IdUsuario. No continuar sin revisar.' END);

-- 7. Confirmacion humana que SQL no puede dar
INSERT @r (Chequeo, Valor, Resultado, Nota)
VALUES ('Procedimiento de recuperacion PROBADO y por escrito', 'confirmacion manual', 'CONFIRMAR',
        'Un respaldo existente no prueba que se pueda restaurar. Complete el paso 0.3 del LEEME (RESTORE VERIFYONLY o restauracion de prueba, tiempo medido, responsable).');

SELECT Orden, Chequeo, Valor, Resultado, Nota FROM @r ORDER BY Orden;

SELECT SUM(CASE WHEN Resultado = 'DETENER' THEN 1 ELSE 0 END) AS Detener,
       SUM(CASE WHEN Resultado = 'CONFIRMAR' THEN 1 ELSE 0 END) AS Confirmar,
       CASE WHEN SUM(CASE WHEN Resultado = 'DETENER' THEN 1 ELSE 0 END) > 0 THEN 'NO CONTINUAR: hay requisitos sin cumplir'
            ELSE 'SIN BLOQUEOS AUTOMATICOS: complete las confirmaciones manuales antes de instalar' END AS Veredicto
FROM @r;
