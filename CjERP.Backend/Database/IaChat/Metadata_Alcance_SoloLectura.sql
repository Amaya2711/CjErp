-- ============================================================================
-- IA Chat — metadata necesaria para cerrar autorización y alcance (Propio/Equipo/Total)
-- SOLO LECTURA: no crea, altera ni borra objetos; no devuelve datos personales
-- (solo definiciones, metadatos y conteos agregados). Ejecutar en la BD del ERP.
-- Enviar de vuelta TODOS los result sets (exportar cada uno a texto/CSV).
-- No es una migración: no versionar como paso NN_.
-- ============================================================================
SET NOCOUNT ON;

-- [1] Base, existencia, cifrado y fecha de modificación del SP
SELECT DB_NAME() AS BaseDatos,
       o.object_id AS IdProcedimiento,
       o.modify_date AS UltimaModificacion,
       CASE WHEN m.definition IS NULL THEN 'SIN DEFINICION (cifrado o sin VIEW DEFINITION)' ELSE 'OK' END AS EstadoDefinicion
FROM sys.objects o
LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar', N'P');

-- [2] Definición completa del SP, una fila por línea
DECLARE @Def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar'));
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

-- [3] Parámetros del SP
SELECT p.parameter_id AS Orden, p.name AS Parametro, t.name AS Tipo,
       p.max_length AS LongitudBytes, p.precision AS [Precision], p.scale AS Escala,
       p.has_default_value AS TieneDefault, p.is_output AS EsSalida
FROM sys.parameters p
JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE p.object_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar')
ORDER BY p.parameter_id;

-- [4] Objetos y columnas que el SP referencia (tablas/vistas/funciones que usa realmente)
SELECT ISNULL(d.referenced_schema_name, 'dbo') AS Esquema,
       d.referenced_entity_name AS ObjetoReferenciado,
       CASE WHEN d.referenced_id IS NOT NULL AND d.referenced_minor_id > 0
            THEN COL_NAME(d.referenced_id, d.referenced_minor_id) END AS Columna
FROM sys.sql_expression_dependencies d
WHERE d.referencing_id = OBJECT_ID(N'dbo.sp_IA_Planilla_Buscar')
ORDER BY d.referenced_entity_name, Columna;

-- [5] Columnas de las tablas relevantes (identidad, jerarquía, perfiles y permisos)
SELECT s.name AS Esquema, tb.name AS Tabla, c.column_id AS Orden, c.name AS Columna,
       ty.name AS Tipo, c.max_length AS LongitudBytes, c.is_nullable AS PermiteNull,
       c.is_identity AS EsIdentity
FROM sys.tables tb
JOIN sys.schemas s ON s.schema_id = tb.schema_id
JOIN sys.columns c ON c.object_id = tb.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE tb.name IN (N'Planilla', N'EmpleadoCj', N'EmpleadoCjDetalle', N'Empleado', N'Usuario',
                  N'EmpleadoCjPerfil', N'SegUsuarioPerfilRol', N'SegPerfil', N'SegRol',
                  N'SegPermisoAccion')
ORDER BY s.name, tb.name, c.column_id;

-- [6] Claves primarias, únicas e índices de esas tablas (para filtrar por identificadores antes de paginar)
SELECT OBJECT_NAME(i.object_id) AS Tabla, i.name AS Indice, i.type_desc AS TipoIndice,
       i.is_primary_key AS EsPK, i.is_unique AS EsUnico,
       STUFF((SELECT ', ' + COL_NAME(ic.object_id, ic.column_id)
                     + CASE WHEN ic.is_included_column = 1 THEN ' (INCLUDE)' ELSE '' END
              FROM sys.index_columns ic
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
              ORDER BY ic.is_included_column, ic.key_ordinal
              FOR XML PATH('')), 1, 2, '') AS Columnas
FROM sys.indexes i
WHERE i.object_id IN (SELECT object_id FROM sys.tables
                      WHERE name IN (N'Planilla', N'EmpleadoCj', N'EmpleadoCjDetalle', N'Empleado', N'Usuario',
                                     N'EmpleadoCjPerfil', N'SegUsuarioPerfilRol'))
  AND i.type > 0
ORDER BY Tabla, i.index_id;

-- [7] Relaciones declaradas (FK) de esas tablas. Si no hay filas, las relaciones son solo por convención.
SELECT fk.name AS Relacion,
       OBJECT_NAME(fkc.parent_object_id) AS TablaOrigen, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS ColumnaOrigen,
       OBJECT_NAME(fkc.referenced_object_id) AS TablaDestino, COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ColumnaDestino
FROM sys.foreign_key_columns fkc
JOIN sys.foreign_keys fk ON fk.object_id = fkc.constraint_object_id
WHERE OBJECT_NAME(fkc.parent_object_id) IN (N'Planilla', N'EmpleadoCj', N'EmpleadoCjDetalle', N'Empleado', N'Usuario', N'EmpleadoCjPerfil', N'SegUsuarioPerfilRol')
   OR OBJECT_NAME(fkc.referenced_object_id) IN (N'Planilla', N'EmpleadoCj', N'EmpleadoCjDetalle', N'Empleado', N'Usuario', N'EmpleadoCjPerfil', N'SegUsuarioPerfilRol')
ORDER BY TablaOrigen, Relacion, fkc.constraint_column_id;

-- [8] Calidad de datos (solo conteos, protegidos por existencia de columnas; sin datos personales)
--     8a. Cuentas (Usuario) por empleado: ¿hay >1 IdUsuario vinculado al mismo empleado?
IF COL_LENGTH(N'dbo.Usuario', N'IdEmpleadoCj') IS NOT NULL
    EXEC sp_executesql N'
    SELECT ''Usuario por IdEmpleadoCj'' AS Chequeo,
           COUNT(*) AS TotalUsuarios,
           SUM(CASE WHEN IdEmpleadoCj IS NULL THEN 1 ELSE 0 END) AS SinEmpleado,
           (SELECT COUNT(*) FROM (SELECT IdEmpleadoCj FROM dbo.Usuario WHERE IdEmpleadoCj IS NOT NULL
                                  GROUP BY IdEmpleadoCj HAVING COUNT(*) > 1) x) AS EmpleadosConMasDeUnaCuenta
    FROM dbo.Usuario;';
ELSE
    SELECT 'Usuario.IdEmpleadoCj no existe: revisar sección [5] para el vínculo usuario-empleado' AS Chequeo;

--     8b. Jerarquía de equipo en EmpleadoCjDetalle (titular -> responsable): profundidad y ciclos
IF COL_LENGTH(N'dbo.EmpleadoCjDetalle', N'IdEmpleadoCj') IS NOT NULL
   AND COL_LENGTH(N'dbo.EmpleadoCjDetalle', N'IdResponsableCj') IS NOT NULL
    EXEC sp_executesql N'
    SELECT ''EmpleadoCjDetalle'' AS Chequeo,
           COUNT(*) AS Filas,
           COUNT(DISTINCT IdEmpleadoCj) AS EmpleadosDistintos,
           SUM(CASE WHEN IdResponsableCj IS NULL THEN 1 ELSE 0 END) AS SinResponsable,
           SUM(CASE WHEN IdResponsableCj = IdEmpleadoCj THEN 1 ELSE 0 END) AS ResponsableEsElMismo,
           (SELECT COUNT(*) FROM (SELECT IdEmpleadoCj FROM dbo.EmpleadoCjDetalle
                                  GROUP BY IdEmpleadoCj HAVING COUNT(*) > 1) x) AS EmpleadosConVariasFilas
    FROM dbo.EmpleadoCjDetalle;

    WITH Arbol AS (
        SELECT IdEmpleadoCj AS Raiz, IdEmpleadoCj AS Actual, IdResponsableCj AS Siguiente, 1 AS Nivel
        FROM dbo.EmpleadoCjDetalle
        UNION ALL
        SELECT a.Raiz, d.IdEmpleadoCj, d.IdResponsableCj, a.Nivel + 1
        FROM Arbol a
        JOIN dbo.EmpleadoCjDetalle d ON d.IdEmpleadoCj = a.Siguiente
        WHERE a.Nivel < 20 AND a.Siguiente <> a.Raiz
    )
    SELECT ''Profundidad de cadena responsable'' AS Chequeo,
           MAX(Nivel) AS NivelMaximo,
           SUM(CASE WHEN Siguiente = Raiz THEN 1 ELSE 0 END) AS CadenasConCiclo
    FROM Arbol
    OPTION (MAXRECURSION 100);';
ELSE
    SELECT 'EmpleadoCjDetalle.IdEmpleadoCj/IdResponsableCj no existen: revisar sección [5]' AS Chequeo;

--     8c. Planilla: nombres vs. identificadores en columnas de responsable/solicitante (según [5])
SELECT c.name AS ColumnaPlanilla, ty.name AS Tipo
FROM sys.columns c
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.Planilla')
  AND (c.name LIKE N'%Respons%' OR c.name LIKE N'%Solicit%' OR c.name LIKE N'%Validador%'
       OR c.name LIKE N'%IdEmp%' OR c.name LIKE N'%Usuario%' OR c.name LIKE N'%CodEmp%')
ORDER BY c.column_id;

-- [9] Perfiles/roles: distribución de cuentas (solo ids y conteos). Sirve para decidir quién tendría alcance Total.
IF OBJECT_ID(N'dbo.SegUsuarioPerfilRol', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.SegUsuarioPerfilRol', N'IdPerfil') IS NOT NULL
   AND COL_LENGTH(N'dbo.SegUsuarioPerfilRol', N'IdRol') IS NOT NULL
    EXEC sp_executesql N'
    SELECT IdPerfil, IdRol, COUNT(*) AS Cuentas
    FROM dbo.SegUsuarioPerfilRol
    GROUP BY IdPerfil, IdRol
    ORDER BY IdPerfil, IdRol;';
ELSE
    SELECT 'SegUsuarioPerfilRol.IdPerfil/IdRol no existen: revisar sección [5]' AS Chequeo;
