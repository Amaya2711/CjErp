-- ============================================================================
-- IA Chat — modulo ASISTENCIA: metadata necesaria para disenar la herramienta de consulta con alcance
-- (Propio/Equipo/Total). SOLO LECTURA: no crea, altera ni borra objetos y no devuelve datos personales
-- (solo definiciones, metadatos y conteos agregados). Ejecutar en JC_Db.
-- Recomendacion: en SSMS usar "Resultados en texto" (Ctrl+T) o exportar cada result set; el [2] devuelve una
-- fila por linea de cada SP. Enviar de vuelta TODOS los result sets.
-- No es una migracion: no versionar como paso NN_.
-- ============================================================================
SET NOCOUNT ON;

-- [1] SP candidatos: existencia, fecha de modificacion y estado de la definicion
SELECT n.Nombre AS Procedimiento,
       o.object_id AS IdObjeto,
       o.modify_date AS UltimaModificacion,
       CASE
           WHEN o.object_id IS NULL THEN 'NO EXISTE'
           WHEN m.definition IS NULL THEN 'SIN DEFINICION (cifrado o sin VIEW DEFINITION)'
           ELSE 'OK'
       END AS EstadoDefinicion
FROM (VALUES (N'dbo.RptAsistenciaFechas'),
             (N'dbo.sp_AsistenciaTracking_Consulta'),
             (N'dbo.sp_Asistencia_UltimoMovimientoEmpleado'),
             (N'dbo.sp_Asistencia_BuscarPorFechas_Job'),
             (N'dbo.sp_Asistencia_ValidarCampo')) n(Nombre)
LEFT JOIN sys.objects o ON o.object_id = OBJECT_ID(n.Nombre, N'P')
LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id;

-- [2] Definicion completa de cada SP, una fila por linea
DECLARE @Lineas TABLE (Procedimiento NVARCHAR(200), NumeroLinea INT, Texto NVARCHAR(MAX));
DECLARE @Nombre NVARCHAR(200), @Def NVARCHAR(MAX), @Pos INT, @Fin INT, @N INT;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT n FROM (VALUES (N'dbo.RptAsistenciaFechas'),
                          (N'dbo.sp_AsistenciaTracking_Consulta'),
                          (N'dbo.sp_Asistencia_UltimoMovimientoEmpleado'),
                          (N'dbo.sp_Asistencia_BuscarPorFechas_Job')) x(n);
OPEN cur;
FETCH NEXT FROM cur INTO @Nombre;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Def = OBJECT_DEFINITION(OBJECT_ID(@Nombre));
    IF @Def IS NOT NULL
    BEGIN
        SET @Pos = 1; SET @N = 1;
        WHILE @Pos <= LEN(@Def)
        BEGIN
            SET @Fin = CHARINDEX(CHAR(10), @Def, @Pos);
            IF @Fin = 0 SET @Fin = LEN(@Def) + 1;
            INSERT @Lineas VALUES (@Nombre, @N, REPLACE(SUBSTRING(@Def, @Pos, @Fin - @Pos), CHAR(13), N''));
            SET @Pos = @Fin + 1; SET @N += 1;
        END;
    END;
    FETCH NEXT FROM cur INTO @Nombre;
END;
CLOSE cur; DEALLOCATE cur;
SELECT Procedimiento, NumeroLinea, Texto AS Definicion FROM @Lineas ORDER BY Procedimiento, NumeroLinea;

-- [3] Parametros de los SP
SELECT OBJECT_NAME(p.object_id) AS Procedimiento, p.parameter_id AS Orden, p.name AS Parametro,
       t.name AS Tipo, p.max_length AS LongitudBytes, p.has_default_value AS TieneDefault, p.is_output AS EsSalida
FROM sys.parameters p
JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE p.object_id IN (OBJECT_ID(N'dbo.RptAsistenciaFechas'), OBJECT_ID(N'dbo.sp_AsistenciaTracking_Consulta'),
                      OBJECT_ID(N'dbo.sp_Asistencia_UltimoMovimientoEmpleado'), OBJECT_ID(N'dbo.sp_Asistencia_BuscarPorFechas_Job'))
ORDER BY OBJECT_NAME(p.object_id), p.parameter_id;

-- [4] Tabla dbo.Asistencia: columnas, tipos y nulabilidad
SELECT c.column_id AS Orden, c.name AS Columna, t.name AS Tipo, c.max_length AS LongitudBytes,
       c.is_nullable AS PermiteNull
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.Asistencia')
ORDER BY c.column_id;

-- [5] Indices y clave primaria de dbo.Asistencia (importa para filtrar por empleado y fecha)
SELECT i.name AS Indice, i.is_primary_key AS EsPK, i.is_unique AS EsUnico,
       STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ', ')
           WITHIN GROUP (ORDER BY ic.key_ordinal) AS Claves
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id = OBJECT_ID(N'dbo.Asistencia') AND i.type > 0
GROUP BY i.name, i.is_primary_key, i.is_unique;

-- [6] Volumen y rango de fechas (agregado; sin datos personales). FechaAsistencia puede ser fecha o texto.
SELECT COUNT(*) AS Filas,
       COUNT(DISTINCT IdEmpleado) AS EmpleadosDistintos,
       MIN(FechaAsistencia) AS FechaMinima,
       MAX(FechaAsistencia) AS FechaMaxima
FROM dbo.Asistencia;

-- [7] Distribucion por estado (IdEstado) con su nombre en la tabla de constantes
SELECT a.IdEstado, k.ValorIni AS NombreEstado, COUNT(*) AS Filas
FROM dbo.Asistencia a
LEFT JOIN dbo.Constante k ON k.Campo = 'estado_asistencia' AND TRY_CONVERT(INT, k.Correlativo) = a.IdEstado
GROUP BY a.IdEstado, k.ValorIni
ORDER BY COUNT(*) DESC;

-- [8] Catalogo estado_asistencia completo
SELECT k.Sociedad, k.Programa, k.Campo, k.Correlativo, k.ValorIni
FROM dbo.Constante k
WHERE k.Campo = 'estado_asistencia'
ORDER BY TRY_CONVERT(INT, k.Correlativo);

-- [9] A que tabla de empleados apunta Asistencia.IdEmpleado? Solo conteos agregados.
--     Si "CoincideEnEmpleadoCj" es casi todo, IdEmpleado es EmpleadoCj.IdEmpleado; si "CoincideEnEmpleado" lo es,
--     es el empleado legado (Empleado.IdEmpleado -> IdEmpleadoCj). Si ambos coinciden, el mapeo es ambiguo (PV).
SELECT COUNT(*) AS FilasMuestra,
       SUM(CASE WHEN cj.IdEmpleado IS NOT NULL THEN 1 ELSE 0 END) AS CoincideEnEmpleadoCj,
       SUM(CASE WHEN e.IdEmpleado IS NOT NULL THEN 1 ELSE 0 END) AS CoincideEnEmpleado,
       SUM(CASE WHEN e.IdEmpleadoCj IS NOT NULL THEN 1 ELSE 0 END) AS EmpleadoConIdEmpleadoCj,
       SUM(CASE WHEN cj.IdEmpleado IS NULL AND e.IdEmpleado IS NULL THEN 1 ELSE 0 END) AS SinCoincidencia
FROM (SELECT TOP (50000) IdEmpleado FROM dbo.Asistencia ORDER BY IdEmpleado DESC) a
LEFT JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = a.IdEmpleado
LEFT JOIN dbo.Empleado e ON e.IdEmpleado = a.IdEmpleado;

-- [10] Referencias: que otros objetos de BD leen dbo.Asistencia (vistas, SP, funciones)
SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS Esquema, OBJECT_NAME(d.referencing_id) AS Objeto,
       o.type_desc AS Tipo
FROM sys.sql_expression_dependencies d
JOIN sys.objects o ON o.object_id = d.referencing_id
WHERE d.referenced_id = OBJECT_ID(N'dbo.Asistencia')
ORDER BY o.type_desc, Objeto;

-- [11] Columnas sensibles presentes en Asistencia (para decidir cuales NO viajan a la IA):
--      coordenadas, imagenes, aprobador, etc. Solo nombres de columna que coinciden con estos patrones.
SELECT c.name AS Columna, t.name AS Tipo
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.Asistencia')
  AND (c.name LIKE '%lat%' OR c.name LIKE '%long%' OR c.name LIKE '%img%' OR c.name LIKE '%imagen%'
       OR c.name LIKE '%foto%' OR c.name LIKE '%url%' OR c.name LIKE '%aprob%' OR c.name LIKE '%doc%')
ORDER BY c.name;
