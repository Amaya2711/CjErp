SET NOCOUNT ON;

DECLARE @Palabras TABLE (Valor sysname NOT NULL PRIMARY KEY);
INSERT INTO @Palabras (Valor) VALUES
  ('Comunicacion'), ('Comunicaciones'), ('Notificacion'), ('Notificaciones'),
  ('Alerta'), ('Alertas'), ('Dispositivo'), ('Device'), ('Push'),
  ('Adjunto'), ('Auditoria'), ('Usuario'), ('Empleado'), ('Sesion');

SELECT
  s.name AS Esquema,
  o.name AS Objeto,
  o.type_desc AS Tipo,
  o.create_date AS FechaCreacion,
  o.modify_date AS FechaModificacion
FROM sys.objects o
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE EXISTS (SELECT 1 FROM @Palabras p WHERE o.name LIKE '%' + p.Valor + '%')
ORDER BY o.type_desc, s.name, o.name;

SELECT
  s.name AS Esquema,
  t.name AS Tabla,
  c.column_id AS Orden,
  c.name AS Columna,
  ty.name AS Tipo,
  c.max_length AS Longitud,
  c.is_nullable AS PermiteNulo
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
INNER JOIN sys.columns c ON c.object_id = t.object_id
INNER JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE EXISTS (SELECT 1 FROM @Palabras p WHERE t.name LIKE '%' + p.Valor + '%')
ORDER BY s.name, t.name, c.column_id;

SELECT
  s.name AS Esquema,
  p.name AS StoredProcedure,
  p.modify_date AS FechaModificacion
FROM sys.procedures p
INNER JOIN sys.schemas s ON s.schema_id = p.schema_id
WHERE p.name LIKE '%Comunic%' OR p.name LIKE '%Notific%' OR p.name LIKE '%Dispositivo%' OR p.name LIKE '%Push%'
ORDER BY s.name, p.name;

SELECT
  s.name AS Esquema,
  t.name AS Tabla,
  i.name AS Indice,
  i.type_desc AS Tipo,
  i.is_unique AS EsUnico,
  STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS Columnas
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
INNER JOIN sys.indexes i ON i.object_id = t.object_id AND i.index_id > 0
INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE EXISTS (SELECT 1 FROM @Palabras p WHERE t.name LIKE '%' + p.Valor + '%')
GROUP BY s.name, t.name, i.name, i.type_desc, i.is_unique
ORDER BY s.name, t.name, i.name;
