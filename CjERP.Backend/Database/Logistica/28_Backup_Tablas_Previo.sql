/*
  Logistica - COPIA DE SEGURIDAD de las tablas (y de las definiciones de procedimientos/trigger) que tocan los scripts 24 a 27
  y, despues, el despacho movil. PV: NO ejecutado. Es de SOLO COPIA: no modifica ninguna tabla existente.

  Que hace
    - Crea el esquema bkp (si no existe) y copia cada tabla a bkp.<Tabla>_<aaaammdd_hhmm> con SELECT INTO (datos; no copia indices
      ni restricciones: sirve para restaurar o comparar, no como tabla de trabajo).
    - Guarda en bkp.Definiciones_<sufijo> el texto de los procedimientos sp_Logistica_*, sp_Stock_*, la vista vStock* y el trigger
      trg_MaterialStock_Ledger tal como estan HOY (el script 26 reemplaza la definicion del trigger).
    - Verifica que cada copia tenga las mismas filas que la tabla origen (si no, falla con error).
  Grupos (medidos el 2026-11-27: JC_Db en recuperacion SIMPLE, log 2 GB al 0,8 %; el total por defecto pesa ~115 MB)
    A (siempre): StockSaldo, StockMovimiento, MaterialStock, StockSaldoInicialExcepcion, StockBucket, LogisticaEtapaConfig,
                 SegMenu, SegRolMenuPermiso        -> las que modifican 26, 27 y el menu movil (00_menu_mobile_despachos.sql).
    B (@IncluirDocumentos = 1, por defecto): DetSolicitud, CabSolicitud, DetLogistica
                 -> las que ACTUALIZA el despacho movil al operar (despachar / rechazar).
    C (@IncluirHistoricos = 0, por defecto): MovMaterial, Kardex, AuditoriaCambios (~390 MB)
                 -> el despacho solo les INSERTA filas (no las modifica); activar solo si se quiere copia completa.
  Los scripts 24 y 25 solo crean procedimientos (no modifican tablas). El script 27 modifica StockSaldo y StockMovimiento y, por
  la proyeccion de sp_Stock_Mover, tambien MaterialStock.

  Ejecutar en una ventana de poca actividad (cada tabla se copia por separado, sin congelar la base). El respaldo completo diario
  de JC_Db sigue siendo la proteccion principal (ultimo registrado: 2026-11-26 01:18).

  Como restaurar una tabla (ejemplo StockSaldo; con el trigger 26 DESHABILITADO y sin usuarios operando):
    BEGIN TRAN;
      DELETE FROM dbo.StockSaldo;
      INSERT INTO dbo.StockSaldo (CodPap, IdAlmacen, Bucket, Cantidad, FechaModificacion)
      SELECT CodPap, IdAlmacen, Bucket, Cantidad, FechaModificacion FROM bkp.StockSaldo_<sufijo>;
    COMMIT;   -- revisar columnas antes: SELECT * INTO no conserva IDENTITY de la tabla original
  Como volver a la definicion anterior del trigger o de un procedimiento: copiar el texto de bkp.Definiciones_<sufijo>.
  Limpieza (cuando ya no haga falta): DROP TABLE bkp.<tabla>; luego DROP SCHEMA bkp si queda vacio.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @IncluirDocumentos bit = 1;
DECLARE @IncluirHistoricos bit = 0;

DECLARE @sfx nvarchar(20) = FORMAT(SYSDATETIME(), 'yyyyMMdd_HHmm');

IF SCHEMA_ID(N'bkp') IS NULL EXEC (N'CREATE SCHEMA bkp');

DECLARE @t TABLE (Id int IDENTITY(1,1) PRIMARY KEY, Tabla sysname NOT NULL, Grupo char(1) NOT NULL);
INSERT INTO @t (Tabla, Grupo) VALUES
  (N'StockSaldo', 'A'), (N'StockMovimiento', 'A'), (N'MaterialStock', 'A'), (N'StockSaldoInicialExcepcion', 'A'),
  (N'StockBucket', 'A'), (N'LogisticaEtapaConfig', 'A'), (N'SegMenu', 'A'), (N'SegRolMenuPermiso', 'A'),
  (N'DetSolicitud', 'B'), (N'CabSolicitud', 'B'), (N'DetLogistica', 'B'),
  (N'MovMaterial', 'C'), (N'Kardex', 'C'), (N'AuditoriaCambios', 'C');

DECLARE @res TABLE (Tabla sysname, Origen bigint, Copia bigint, Copiada varchar(20));

DECLARE @i int = 1, @max int = (SELECT MAX(Id) FROM @t);
DECLARE @tabla sysname, @grupo char(1), @sql nvarchar(max), @destino sysname, @o bigint, @c bigint;

WHILE @i <= @max
BEGIN
  SELECT @tabla = Tabla, @grupo = Grupo FROM @t WHERE Id = @i;
  SET @i += 1;

  IF (@grupo = 'B' AND @IncluirDocumentos = 0) OR (@grupo = 'C' AND @IncluirHistoricos = 0) CONTINUE;

  IF OBJECT_ID(N'dbo.' + QUOTENAME(@tabla), N'U') IS NULL
  BEGIN
    INSERT INTO @res VALUES (@tabla, NULL, NULL, 'NO EXISTE (omitida)');
    CONTINUE;
  END;

  SET @destino = @tabla + N'_' + @sfx;
  SET @sql = N'SELECT * INTO bkp.' + QUOTENAME(@destino) + N' FROM dbo.' + QUOTENAME(@tabla) + N';';
  EXEC (@sql);

  SET @sql = N'SELECT @o = COUNT_BIG(*) FROM dbo.' + QUOTENAME(@tabla) + N'; SELECT @c = COUNT_BIG(*) FROM bkp.' + QUOTENAME(@destino) + N';';
  EXEC sp_executesql @sql, N'@o bigint OUTPUT, @c bigint OUTPUT', @o = @o OUTPUT, @c = @c OUTPUT;

  -- El sistema esta en uso: el origen puede cambiar entre la copia y el conteo. Igual = OK; distinto = DIFIERE (informativo);
  -- copia vacia con origen con datos = REVISAR (error).
  INSERT INTO @res VALUES (@tabla, @o, @c, CASE WHEN @c = @o THEN 'OK' WHEN @c = 0 AND @o > 0 THEN 'REVISAR' ELSE 'DIFIERE' END);
END;

-- Definiciones (texto) de los objetos programables relacionados.
DECLARE @defTabla sysname = N'Definiciones_' + @sfx;
SET @sql = N'SELECT o.name AS Objeto, o.type_desc AS Tipo, m.definition AS Definicion, SYSDATETIME() AS FechaCopia
             INTO bkp.' + QUOTENAME(@defTabla) + N'
             FROM sys.objects o JOIN sys.sql_modules m ON m.object_id = o.object_id
             WHERE o.type IN (''P'', ''TR'', ''V'', ''FN'', ''IF'', ''TF'')
               AND (o.name LIKE ''sp[_]Logistica[_]%'' OR o.name LIKE ''sp[_]Stock[_]%'' OR o.name LIKE ''trg[_]MaterialStock%''
                    OR o.name LIKE ''vStock%'' OR o.name LIKE ''sp[_]Logistica[_]Despacho%'');';
EXEC (@sql);
SET @sql = N'SELECT COUNT(*) AS Definiciones_copiadas FROM bkp.' + QUOTENAME(@defTabla) + N';';
EXEC (@sql);

SELECT @sfx AS Sufijo, r.Tabla, r.Origen, r.Copia, r.Copiada FROM @res r ORDER BY r.Tabla;

IF EXISTS (SELECT 1 FROM @res WHERE Copiada = 'REVISAR')
  THROW 52200, 'Alguna copia quedo vacia aunque su origen tiene datos. Revise el resultado y repita el script.', 1;
