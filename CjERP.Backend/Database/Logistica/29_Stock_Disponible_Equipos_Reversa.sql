/*
  Logistica / Stock - CORRECCION de la conciliacion de Disponible (script 27 aplicado con equipos).
  PV: NO ejecutado. Requiere 26 y 27 (version corregida) ya ejecutados. Ejecutar la PARTE 1 y luego la PARTE 2.

  Problema (medido el 2026-11-27, solo lectura): la aplicacion del 27 incluyo materiales con series. En ellos StockSaldo.Disponible
  seguia a las series libres (DetLogistica.IdEstado = 2) y MaterialStock.Disponible del sistema antiguo esta sobrestimado
  (ej. 4072554: MaterialStock 112, series libres 1). Resultado: 49 equipos 40 (+1.270 u. netas) y el 6000174 (+10 u.) quedaron con
  Disponible nuevo por encima de las series libres (exceso total 1.307 u. en 50 materiales). No hay movimientos posteriores sobre ellos.

  PARTE 1 - Trigger: se redefine para NO capturar materiales con series (CodPap 40*). El Disponible de esos materiales sigue a las
            series y el del sistema antiguo no es fiable. Se deja HABILITADO (como esta hoy).
  PARTE 2 - Reversa: por cada ajuste 'AJUSTE' con clave CONCILIAR_DISP:* sobre CodPap 40* o 6000174 se registra el movimiento
            inverso ('AJUSTE_REVERSA', clave REVERSA:<clave original>, repetible sin duplicar). Simulacion por defecto.
  Efecto colateral conocido: sp_Stock_Mover proyecta la fila completa de StockSaldo a MaterialStock; la reversa dejara
  MaterialStock.Disponible de esos materiales igual a StockSaldo (series), es decir mas bajo que el valor antiguo.
*/
SET NOCOUNT ON;
GO

/* ------------------------------ PARTE 1: trigger sin materiales con series ------------------------------ */
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
      ('Bloqueado',    CONVERT(decimal(18,4), ISNULL(i.Bloqueado, 0)),    CONVERT(decimal(18,4), ISNULL(o.Bloqueado, 0)))
    ) v (Bucket, Nuevo, Anterior)
    WHERE v.Nuevo <> v.Anterior
      AND LEFT(CAST(i.CodPap AS nvarchar(50)), 2) <> N'40';   -- materiales con series: el Disponible sigue a DetLogistica

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
           ABS(Delta), 'LEGACY_UPDATE', ORIGINAL_LOGIN(), N'Cambio directo sobre MaterialStock (sistema antiguo), bucket compartido'
    FROM @d;
  END TRY
  BEGIN CATCH
    RETURN;   -- nunca interrumpir al sistema antiguo; el descuadre queda en dbo.vStockDescuadres
  END CATCH;
END;
GO

ENABLE TRIGGER dbo.trg_MaterialStock_Ledger ON dbo.MaterialStock;
GO

/* ------------------------------ PARTE 2: reversa de los ajustes sobre materiales con series ------------------------------ */
-- Cambiar a 1 para APLICAR (con 0 solo lista lo que se revertiria).
DECLARE @Aplicar bit = 0;

IF OBJECT_ID(N'tempdb..#rev') IS NOT NULL DROP TABLE #rev;

SELECT m.IdMovimiento, CAST(m.CodPap AS nvarchar(50)) AS CodPap, m.BucketOrigen, m.BucketDestino, m.Cantidad, m.ClaveIdempotencia
INTO #rev
FROM dbo.StockMovimiento m
WHERE m.Operacion = 'AJUSTE'
  AND m.ClaveIdempotencia LIKE N'CONCILIAR_DISP:%'
  AND (LEFT(CAST(m.CodPap AS nvarchar(50)), 2) = N'40' OR CAST(m.CodPap AS nvarchar(50)) = N'6000174')
  AND NOT EXISTS (SELECT 1 FROM dbo.StockMovimiento r WHERE r.ClaveIdempotencia = N'REVERSA:' + m.ClaveIdempotencia);

SELECT r.CodPap,
       CASE WHEN r.BucketDestino = 'Disponible' THEN r.Cantidad ELSE -r.Cantidad END AS AjusteOriginal,
       ISNULL((SELECT SUM(s.Cantidad) FROM dbo.StockSaldo s WHERE s.CodPap = r.CodPap AND s.Bucket = 'Disponible'), 0) AS DisponibleHoy,
       (SELECT COUNT(*) FROM dbo.DetLogistica l WHERE CAST(l.CodPap AS nvarchar(50)) = r.CodPap AND l.IdEstado = 2
          AND LEN(ISNULL(l.Serie, '')) > 0 AND l.Serie <> 'NO APLICA') AS SeriesLibres,
       CASE WHEN r.BucketDestino = 'Disponible' THEN 'REVIERTE (resta)' ELSE 'REVIERTE (suma)' END AS Accion
FROM #rev r ORDER BY r.CodPap;

IF @Aplicar = 1
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT CodPap, BucketOrigen, BucketDestino, Cantidad, ClaveIdempotencia FROM #rev ORDER BY IdMovimiento;
    DECLARE @cod nvarchar(50), @bo varchar(20), @bd varchar(20), @cant decimal(18,4), @clave nvarchar(100), @claveRev nvarchar(100);

    OPEN c;
    FETCH NEXT FROM c INTO @cod, @bo, @bd, @cant, @clave;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @claveRev = N'REVERSA:' + @clave;
      IF @bd = 'Disponible' AND @bo IS NULL
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Disponible', @BucketDestino = NULL, @Cantidad = @cant,
          @Operacion = 'AJUSTE_REVERSA', @Usuario = N'REVERSA29',
          @Observacion = N'Reversa de conciliacion de Disponible sobre material con series', @ClaveIdempotencia = @claveRev;
      ELSE IF @bo = 'Disponible' AND @bd IS NULL
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = NULL, @BucketDestino = 'Disponible', @Cantidad = @cant,
          @Operacion = 'AJUSTE_REVERSA', @Usuario = N'REVERSA29',
          @Observacion = N'Reversa de conciliacion de Disponible sobre material con series', @ClaveIdempotencia = @claveRev;
      FETCH NEXT FROM c INTO @cod, @bo, @bd, @cant, @clave;
    END;
    CLOSE c;
    DEALLOCATE c;

    COMMIT TRANSACTION;
    SELECT COUNT(*) AS Revertidos FROM #rev;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
