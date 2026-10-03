-- ============================================================================
-- VERIFICACION (SOLO LECTURA) del estado de dbo.sp_IA_Planilla_Buscar — v2.
-- No crea ni modifica nada. Ejecutar en la BD que se quiere comprobar y devolver todos los result sets.
--
-- CORRECCION v2: la version 1 clasificaba con LIKE sobre el texto crudo de la definicion, de modo que una
-- mencion en un COMENTARIO (o en un literal) podia dar un falso "version con alcance". Ahora la
-- clasificacion usa (a) los parametros reales del objeto (sys.parameters) y (b) el texto EJECUTABLE: la
-- definicion con comentarios (-- y /* */) retirados, respetando literales de cadena.
-- ============================================================================
SET NOCOUNT ON;

DECLARE @obj INT = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar', N'P');
DECLARE @d NVARCHAR(MAX) = OBJECT_DEFINITION(@obj);

-- Retira comentarios, conservando literales ('...') tal cual.
DECLARE @clean NVARCHAR(MAX) = N'';
DECLARE @i INT = 1, @n INT = ISNULL(DATALENGTH(@d), 0) / 2, @st TINYINT = 0, @c NCHAR(1), @c2 NCHAR(1);
-- @st: 0 normal | 1 comentario de linea | 2 comentario de bloque | 3 literal de cadena
WHILE @i <= @n
BEGIN
    SET @c = SUBSTRING(@d, @i, 1);
    SET @c2 = SUBSTRING(@d, @i + 1, 1);

    IF @st = 0
    BEGIN
        IF @c = N''''
        BEGIN SET @st = 3; SET @clean += @c; END
        ELSE IF @c = N'-' AND @c2 = N'-'
        BEGIN SET @st = 1; SET @i += 1; SET @clean += N' '; END
        ELSE IF @c = N'/' AND @c2 = N'*'
        BEGIN SET @st = 2; SET @i += 1; SET @clean += N' '; END
        ELSE
            SET @clean += @c;
    END
    ELSE IF @st = 1
    BEGIN
        IF @c = NCHAR(10) BEGIN SET @st = 0; SET @clean += N' '; END
    END
    ELSE IF @st = 2
    BEGIN
        IF @c = N'*' AND @c2 = N'/' BEGIN SET @st = 0; SET @i += 1; END
    END
    ELSE
    BEGIN
        SET @clean += @c;
        IF @c = N'''' SET @st = 0;
    END

    SET @i += 1;
END;

DECLARE @norm NVARCHAR(MAX) = UPPER(REPLACE(REPLACE(REPLACE(@clean, NCHAR(13), N' '), NCHAR(10), N' '), NCHAR(9), N' '));
WHILE CHARINDEX(N'  ', @norm) > 0 SET @norm = REPLACE(@norm, N'  ', N' ');

DECLARE @Params4 INT =
(
    SELECT COUNT(*) FROM sys.parameters p
    WHERE p.object_id = @obj
      AND p.name IN (N'@AlcanceNivel', N'@AlcanceCampos', N'@AlcanceEmpleados', N'@VerTotalesGlobales')
);
DECLARE @Throw50010Ejecutable BIT = CASE WHEN @norm LIKE N'%THROW 50010%' THEN 1 ELSE 0 END;
DECLARE @RefAlcanceEjecutable BIT = CASE WHEN @norm LIKE N'%@ALCANCENIVEL%' THEN 1 ELSE 0 END;
DECLARE @RefAlcanceCrudo BIT = CASE WHEN @d LIKE N'%@AlcanceNivel%' THEN 1 ELSE 0 END;

-- [1] Estado del objeto y clasificacion (evidencia estructural, no por palabras sueltas)
SELECT @@SERVERNAME AS Servidor,
       DB_NAME() AS BaseDatos,
       o.modify_date AS UltimaModificacion,
       (SELECT COUNT(*) FROM sys.parameters p WHERE p.object_id = o.object_id) AS CantidadParametros,
       @Params4 AS ParametrosDeAlcance,
       @Throw50010Ejecutable AS Throw50010EnCodigoEjecutable,
       @RefAlcanceEjecutable AS ReferenciaAlcanceEnCodigoEjecutable,
       CASE WHEN @RefAlcanceCrudo = 1 AND @RefAlcanceEjecutable = 0 THEN 1 ELSE 0 END AS AlcanceMencionadoSoloEnComentarios,
       DATALENGTH(@d) / 2 AS CaracteresDefinicion,
       CASE
           WHEN @d IS NULL THEN 'SIN DEFINICION (cifrado o sin VIEW DEFINITION)'
           WHEN @Params4 = 4 AND @Throw50010Ejecutable = 1 THEN 'CON ALCANCE (script 02): parametros + THROW 50010 ejecutable - INCOMPATIBLE con el backend actual'
           WHEN @Params4 = 0 AND @Throw50010Ejecutable = 0 AND @RefAlcanceEjecutable = 0 THEN 'SIN ALCANCE (version anterior): compatible con el backend actual'
           ELSE 'INCONSISTENTE: revisar la definicion completa (script 05)'
       END AS Clasificacion
FROM sys.objects o
WHERE o.object_id = @obj;

-- [2] Parametros actuales (18 = anterior; 22 = con alcance)
SELECT p.parameter_id AS Orden, p.name AS Parametro, TYPE_NAME(p.user_type_id) AS Tipo, p.has_default_value AS TieneDefault
FROM sys.parameters p
WHERE p.object_id = @obj
ORDER BY p.parameter_id;

-- [3] Otros objetos de BD que llaman a este procedimiento
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema, OBJECT_NAME(d.referencing_id) AS ObjetoQueLoLlama
FROM sys.sql_expression_dependencies d
WHERE d.referenced_id = @obj;

-- [4] Ejecuciones segun la cache de planes (se vacia al modificar el SP o reiniciar: vacio NO prueba que no se uso)
SELECT ps.last_execution_time AS UltimaEjecucion, ps.execution_count AS Ejecuciones, ps.cached_time AS PlanEnCacheDesde
FROM sys.dm_exec_procedure_stats ps
WHERE ps.database_id = DB_ID() AND ps.object_id = @obj;

-- [5] Consultas del IA Chat registradas por la auditoria desde el 2026-10-03 07:00 (solo conteos y fecha del ultimo error)
IF OBJECT_ID(N'dbo.IaChatAuditoria', N'U') IS NOT NULL
BEGIN
    SELECT FueExitoso, COUNT(*) AS Consultas, MIN(FechaCreacion) AS Primera, MAX(FechaCreacion) AS Ultima
    FROM dbo.IaChatAuditoria
    WHERE Herramienta = 'buscar_planilla' AND FechaCreacion >= '2026-10-03T07:00:00'
    GROUP BY FueExitoso;

    SELECT TOP (5) FechaCreacion, LEFT(MensajeError, 200) AS MensajeError
    FROM dbo.IaChatAuditoria
    WHERE Herramienta = 'buscar_planilla' AND FueExitoso = 0 AND FechaCreacion >= '2026-10-03T07:00:00'
    ORDER BY FechaCreacion DESC;
END;
