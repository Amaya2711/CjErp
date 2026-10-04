-- ============================================================================
-- IA Chat — estado actual de dbo.sp_IA_Planilla_Resumen. SOLO LECTURA: no crea, altera ni borra objetos y no
-- devuelve datos de negocio (solo definicion, metadatos y conteos). Ejecutar en JC_Db.
-- Recomendacion: "Resultados en texto" (Ctrl+T). Enviar de vuelta TODOS los result sets.
-- No es una migracion: no versionar como paso NN_.
-- ============================================================================
SET NOCOUNT ON;

-- [1] Existencia, fechas y estado de la definicion
SELECT DB_NAME() AS BaseDatos, o.name AS Procedimiento, o.create_date AS Creado, o.modify_date AS Modificado,
       CASE WHEN m.definition IS NULL THEN 'SIN DEFINICION (cifrado o sin VIEW DEFINITION)' ELSE 'OK' END AS EstadoDefinicion,
       LEN(m.definition) AS CaracteresDefinicion
FROM sys.objects o
LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen', N'P');

-- [2] Definicion completa, una fila por linea
DECLARE @Def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen'));
DECLARE @Lineas TABLE (NumeroLinea INT, Texto NVARCHAR(MAX));
IF @Def IS NOT NULL
BEGIN
    DECLARE @Pos INT = 1, @Fin INT, @N INT = 1;
    WHILE @Pos <= LEN(@Def)
    BEGIN
        SET @Fin = CHARINDEX(CHAR(10), @Def, @Pos);
        IF @Fin = 0 SET @Fin = LEN(@Def) + 1;
        INSERT @Lineas VALUES (@N, REPLACE(SUBSTRING(@Def, @Pos, @Fin - @Pos), CHAR(13), N''));
        SET @Pos = @Fin + 1; SET @N += 1;
    END;
END;
SELECT NumeroLinea, Texto AS DefinicionSP FROM @Lineas ORDER BY NumeroLinea;

-- [3] Parametros
SELECT p.parameter_id AS Orden, p.name AS Parametro, t.name AS Tipo, p.max_length AS LongitudBytes,
       p.has_default_value AS TieneDefault, p.is_output AS EsSalida
FROM sys.parameters p
JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE p.object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen')
ORDER BY p.parameter_id;

-- [4] Columnas de cada result set que devuelve (con valores de prueba que no filtran nada). Ejecuta el SP una vez
--     con @AgruparPor = 'CLIENTE' y un rango de fechas de 1 dia; si el SP exige otros parametros, el bloque falla
--     y basta con enviar los demas result sets.
BEGIN TRY
    EXEC sp_describe_first_result_set
         N'EXEC dbo.sp_IA_Planilla_Resumen @AgruparPor = ''CLIENTE'', @FechaInicio = ''2026-09-01'', @FechaFin = ''2026-09-01''';
END TRY
BEGIN CATCH
    SELECT ERROR_NUMBER() AS ErrorNumero, ERROR_MESSAGE() AS ErrorMensaje;
END CATCH;

-- [5] Quien lo referencia en la BD (otros SP / vistas)
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema, OBJECT_NAME(d.referencing_id) AS ObjetoQueLoLlama
FROM sys.sql_expression_dependencies d
WHERE d.referenced_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen');

-- [6] Ejecuciones segun la cache de planes (vacio NO prueba que no se uso)
SELECT ps.last_execution_time AS UltimaEjecucion, ps.execution_count AS Ejecuciones, ps.cached_time AS PlanEnCacheDesde
FROM sys.dm_exec_procedure_stats ps
WHERE ps.database_id = DB_ID() AND ps.object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen');

-- [7] Permisos explicitos sobre el SP
SELECT pr.name AS Principal, dp.permission_name AS Permiso, dp.state_desc AS Estado
FROM sys.database_permissions dp
JOIN sys.database_principals pr ON pr.principal_id = dp.grantee_principal_id
WHERE dp.major_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Resumen');
