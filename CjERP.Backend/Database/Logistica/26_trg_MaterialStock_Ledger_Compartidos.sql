/*
  Logistica / Stock - TRIGGER de captura REDUCIDO a los buckets compartidos (reemplaza la definicion del script 04).
  PV: NO ejecutado ni probado contra la BD. Se deja DESHABILITADO: se habilita desde 27_Stock_Disponible_Conciliar.sql
  (@Aplicar = 1, @HabilitarTrigger = 1) en la misma transaccion que corrige el desvio, para no perder ni duplicar cambios.

  Contexto (migracion parcial, convivencia de ambos sistemas; CabSolicitud.IdWeb = 1 -> sistema nuevo, NULL -> antiguo):
    - Los buckets de COLA (Solicitado, Aprobado, Despachado, Enviado, Campo, Cruce, Cierre, Folio, Culminadas, Excedente,
      Observada) pertenecen a cada documento. El sistema antiguo los mueve para SUS documentos y el nuevo para los suyos; copiar
      los del antiguo al libro mezclaria ambos y taparia faltantes reales en el nuevo (ademas esos buckets de MaterialStock
      estan danados: ver 05). Por eso NO se capturan.
    - Los buckets COMPARTIDOS son los de entrada de material, que ambos sistemas consumen y alimentan del mismo stock fisico:
      Recepcionado, Validado, Disponible y Bloqueado. Esos si se capturan (Operacion = 'LEGACY_UPDATE').
  Ignora los cambios hechos por sp_Stock_ProyectarMaterialStock (SESSION_CONTEXT 'StockSync'). Un error aqui nunca debe romper al
  sistema antiguo: se traga dentro de TRY/CATCH y el descuadre queda visible en dbo.vStockDescuadres.
  ACTUALIZADO 2026-11-27: la PARTE 1 de 29_Stock_Disponible_Equipos_Reversa.sql reemplaza esta definicion (excluye materiales con series, CodPap 40*) y deja el trigger HABILITADO. No volver a ejecutar este 26 despues de aplicar el 29 (terminaria con DISABLE).
  Para volver a la definicion anterior (todos los buckets) ejecutar 04_trg_MaterialStock_Ledger.sql (no se recomienda).
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
      ('Bloqueado',    CONVERT(decimal(18,4), ISNULL(i.Bloqueado, 0)),    CONVERT(decimal(18,4), ISNULL(o.Bloqueado, 0)))
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
           ABS(Delta), 'LEGACY_UPDATE', ORIGINAL_LOGIN(), N'Cambio directo sobre MaterialStock (sistema antiguo), bucket compartido'
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
