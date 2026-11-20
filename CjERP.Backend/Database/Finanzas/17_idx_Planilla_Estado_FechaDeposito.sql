-- Indice para el filtro de /reportes/gerencial/analisis (sp_Movimientos_Consulta_GastosIngresos, estado 4 + rango de FechaDeposito).
-- NO EJECUTADO. Requiere aprobacion y horario de baja carga. Aplicar DESPUES de 16_sp_...rendimiento.sql.
-- Planilla.FechaDeposito es NVARCHAR(10) 'yyyy-mm-dd'; el orden del texto coincide con el orden de fechas.
-- Antes de crear, revisar que no exista uno equivalente:
--   SELECT i.name, c.name AS col, ic.key_ordinal FROM sys.indexes i
--   JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
--   JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
--   WHERE i.object_id = OBJECT_ID('dbo.Planilla') ORDER BY i.name, ic.key_ordinal;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Planilla_Estado_FechaDeposito' AND object_id = OBJECT_ID('dbo.Planilla'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Planilla_Estado_FechaDeposito
        ON dbo.Planilla (Estado, FechaDeposito);
        -- Agregar WITH (ONLINE = ON) solo si la edicion de SQL Server lo permite.
END;
