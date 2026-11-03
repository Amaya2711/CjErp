-- SOLO LECTURA. Instantanea del estado ANTES de aplicar el script 18. Guardar la salida junto al acta de despliegue
-- para poder comparar y para saber exactamente que existia. No modifica nada.
-- Uso: sqlcmd -S <servidor> -d JC_Db -U <admin> -i 18a_CjIntelligence_Snapshot_SoloLectura.sql -o snapshot_antes_18.txt
SET NOCOUNT ON;

SELECT DB_NAME() AS BaseDeDatos, SYSUTCDATETIME() AS FechaUtc;

SELECT 'filas' AS Seccion, t.name AS Tabla, SUM(p.rows) AS Filas
FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta', 'IA_Turno', 'IA_ConversacionEstado', 'IA_ResultadoConsulta')
GROUP BY t.name ORDER BY t.name;

SELECT 'columnas' AS Seccion, t.name AS Tabla, c.column_id AS Ord, c.name AS Columna, ty.name AS Tipo,
       CASE WHEN ty.name IN ('nvarchar') THEN CASE WHEN c.max_length = -1 THEN -1 ELSE c.max_length / 2 END
            WHEN ty.name IN ('varchar', 'varbinary') THEN c.max_length END AS Largo,
       c.is_nullable AS Nulo, ISNULL(dc.definition, '') AS Defecto, ISNULL(c.collation_name, '') AS Collation
FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE t.name IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta')
ORDER BY t.name, c.column_id;

SELECT 'indices' AS Seccion, OBJECT_NAME(i.object_id) AS Tabla, i.name AS Indice, i.type_desc AS Tipo, i.is_unique AS EsUnico,
       i.filter_definition AS Filtro,
       STRING_AGG(c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columnas
FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE OBJECT_NAME(i.object_id) IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta')
GROUP BY i.object_id, i.name, i.type_desc, i.is_unique, i.filter_definition ORDER BY 2, 3;

SELECT 'restricciones' AS Seccion, OBJECT_NAME(parent_object_id) AS Tabla, name AS Nombre, type_desc AS Tipo
FROM sys.objects WHERE type IN ('C', 'F', 'D', 'PK', 'UQ') AND OBJECT_NAME(parent_object_id) IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta')
ORDER BY 2, 4, 3;

SELECT 'objetos_cj' AS Seccion, name AS Nombre, type_desc AS Tipo, modify_date AS Modificado
FROM sys.objects WHERE name LIKE 'sp[_]IA[_]Cj[_]%' OR name LIKE 'fn[_]IA[_]Cj[_]%' OR name IN ('IA_Turno', 'IA_ConversacionEstado', 'IA_ResultadoConsulta');

SELECT 'principales' AS Seccion, name AS Nombre, type_desc AS Tipo
FROM sys.database_principals WHERE name IN ('cj_ia', 'rol_cj_ia');

SELECT 'referencias_a_tablas_IA' AS Seccion, OBJECT_NAME(d.referencing_id) AS Objeto
FROM sys.sql_expression_dependencies d
WHERE d.referenced_entity_name IN ('IA_Conversacion', 'IA_Mensaje', 'IA_AuditoriaConsulta');

SELECT TOP (1) 'ultimo_respaldo_completo' AS Seccion, backup_finish_date AS Fecha
FROM msdb.dbo.backupset WHERE database_name = DB_NAME() AND type = 'D' ORDER BY backup_finish_date DESC;
