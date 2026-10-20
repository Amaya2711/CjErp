/*
  Logistica / Stock - TRIGGER de captura para la convivencia con el sistema antiguo.
  PV: no ejecutado ni probado contra la BD. Se crea DESHABILITADO; lo habilita 05_Stock_SaldoInicial.sql
  dentro de la misma transaccion en la que carga el saldo inicial (para no perder ni duplicar cambios).
  ATENCION: NO volver a ejecutar este script despues del saldo inicial: termina con DISABLE TRIGGER y dejaria de capturar.

  Mientras una etapa siga en el sistema antiguo, este (VB) modifica dbo.MaterialStock directamente.
  El trigger traduce cada cambio a movimientos del libro (Operacion = 'LEGACY_UPDATE') y actualiza StockSaldo,
  asi el libro nunca se desfasa. Ignora los cambios hechos por sp_Stock_ProyectarMaterialStock (SESSION_CONTEXT 'StockSync').
  La columna Stock (total) no se captura: el total se deriva de la suma de buckets.
  Un error aqui nunca debe romper al sistema antiguo: se traga dentro de TRY/CATCH (y se detecta luego en vStockDescuadres).
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER dbo.trg_MaterialStock_Ledger
ON dbo.MaterialStock
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  IF TRY_CONVERT(int, SESSION_CONTEXT(N'StockSync')) = 1 RETURN;

  BEGIN TRY
    DECLARE @d TABLE (CodPap nvarchar(50) NOT NULL, Bucket varchar(20) NOT NULL, Delta decimal(18,4) NOT NULL);

    INSERT INTO @d (CodPap, Bucket, Delta)
    SELECT i.CodPap, v.Bucket, v.Nuevo - v.Anterior
    FROM inserted i
    LEFT JOIN deleted o ON o.CodPap = i.CodPap
    CROSS APPLY (VALUES
      ('Recepcionado', CONVERT(decimal(18,4), ISNULL(i.Recepcionado, 0)), CONVERT(decimal(18,4), ISNULL(o.Recepcionado, 0))),
      ('Validado',     CONVERT(decimal(18,4), ISNULL(i.Validado, 0)),     CONVERT(decimal(18,4), ISNULL(o.Validado, 0))),
      ('Disponible',   CONVERT(decimal(18,4), ISNULL(i.Disponible, 0)),   CONVERT(decimal(18,4), ISNULL(o.Disponible, 0))),
      ('Bloqueado',    CONVERT(decimal(18,4), ISNULL(i.Bloqueado, 0)),    CONVERT(decimal(18,4), ISNULL(o.Bloqueado, 0))),
      ('Solicitado',   CONVERT(decimal(18,4), ISNULL(i.Solicitado, 0)),   CONVERT(decimal(18,4), ISNULL(o.Solicitado, 0))),
      ('Aprobado',     CONVERT(decimal(18,4), ISNULL(i.Aprobado, 0)),     CONVERT(decimal(18,4), ISNULL(o.Aprobado, 0))),
      ('Despachado',   CONVERT(decimal(18,4), ISNULL(i.Despachado, 0)),   CONVERT(decimal(18,4), ISNULL(o.Despachado, 0))),
      ('Enviado',      CONVERT(decimal(18,4), ISNULL(i.Enviado, 0)),      CONVERT(decimal(18,4), ISNULL(o.Enviado, 0))),
      ('Campo',        CONVERT(decimal(18,4), ISNULL(i.Campo, 0)),        CONVERT(decimal(18,4), ISNULL(o.Campo, 0))),
      ('Cruce',        CONVERT(decimal(18,4), ISNULL(i.Cruce, 0)),        CONVERT(decimal(18,4), ISNULL(o.Cruce, 0))),
      ('Cierre',       CONVERT(decimal(18,4), ISNULL(i.Cierre, 0)),       CONVERT(decimal(18,4), ISNULL(o.Cierre, 0))),
      ('Folio',        CONVERT(decimal(18,4), ISNULL(i.Folio, 0)),        CONVERT(decimal(18,4), ISNULL(o.Folio, 0))),
      ('Culminadas',   CONVERT(decimal(18,4), ISNULL(i.Culminadas, 0)),   CONVERT(decimal(18,4), ISNULL(o.Culminadas, 0))),
      ('Excedente',    CONVERT(decimal(18,4), ISNULL(i.Excedente, 0)),    CONVERT(decimal(18,4), ISNULL(o.Excedente, 0))),
      ('Observada',    CONVERT(decimal(18,4), ISNULL(i.Observada, 0)),    CONVERT(decimal(18,4), ISNULL(o.Observada, 0)))
    ) v (Bucket, Nuevo, Anterior)
    WHERE v.Nuevo <> v.Anterior;

    IF NOT EXISTS (SELECT 1 FROM @d) RETURN;

    MERGE dbo.StockSaldo WITH (HOLDLOCK) AS t
    USING (SELECT CodPap, Bucket, SUM(Delta) AS Delta FROM @d GROUP BY CodPap, Bucket) AS s
      ON t.CodPap = s.CodPap AND t.IdAlmacen = 0 AND t.Bucket = s.Bucket
    WHEN MATCHED THEN UPDATE SET Cantidad = t.Cantidad + s.Delta, FechaModificacion = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (CodPap, IdAlmacen, Bucket, Cantidad) VALUES (s.CodPap, 0, s.Bucket, s.Delta);

    INSERT INTO dbo.StockMovimiento (CodPap, IdAlmacen, BucketOrigen, BucketDestino, Cantidad, Operacion, Usuario, Observacion)
    SELECT CodPap, 0,
           CASE WHEN Delta < 0 THEN Bucket END,
           CASE WHEN Delta > 0 THEN Bucket END,
           ABS(Delta), 'LEGACY_UPDATE', ORIGINAL_LOGIN(), N'Cambio directo sobre MaterialStock (sistema antiguo)'
    FROM @d;
  END TRY
  BEGIN CATCH
    -- No interrumpir al sistema antiguo. El descuadre quedara visible en dbo.vStockDescuadres.
    RETURN;
  END CATCH;
END;
GO

DISABLE TRIGGER dbo.trg_MaterialStock_Ledger ON dbo.MaterialStock;
GO
