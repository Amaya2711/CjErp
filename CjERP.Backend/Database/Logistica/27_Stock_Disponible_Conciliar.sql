/*
  Logistica / Stock - CONCILIACION DEL DISPONIBLE entre el sistema antiguo (MaterialStock) y el libro nuevo (StockSaldo).
  PV: NO ejecutado ni probado contra la BD. Requiere 01-05 y 26.

  Por que: con la migracion parcial (CabSolicitud.IdWeb = 1 nuevo / NULL antiguo) el Disponible es el unico stock realmente
  compartido. El 2026-11-27 (solo lectura) se midio un desvio desde la carga del 2026-10-12: 131 de 2.186 materiales
  (25 normales / 11.274 u.; 106 equipos 40 / 6.939 u.). El trigger 04 estaba deshabilitado y el libro no tenia LEGACY_UPDATE.

  Regla: el Disponible objetivo es MaterialStock.Disponible (si es negativo, 0). Se ajusta StockSaldo.Disponible (IdAlmacen 0)
  con movimientos 'AJUSTE' via sp_Stock_Mover. NO toca ningun otro bucket.
  MATERIALES CON SERIES (CodPap 40* o con series libres en DetLogistica) NUNCA se ajustan a MaterialStock. Verificado el 2026-11-27
  tras la primera aplicacion: en esos materiales StockSaldo.Disponible sigue a las series libres (DetLogistica.IdEstado = 2) y
  MaterialStock.Disponible del sistema antiguo esta sobrestimado (ej. 4072554: MaterialStock 112, series libres 1). Ajustarlos a
  MaterialStock subio el Disponible nuevo muy por encima de lo realmente disponible; ver 29_Stock_Disponible_Equipos_Reversa.sql.

  Uso recomendado (PV: la base es unica, ejecutar en ventana acordada):
    1) EXEC dbo.sp_Stock_Disponible_Conciliar;                                -- simulacion: solo lista, no escribe
    2) EXEC dbo.sp_Stock_Disponible_Conciliar @Aplicar = 1, @HabilitarTrigger = 1;   -- solo materiales sin series (+ habilita el trigger)
  El paso 2 ajusta y habilita el trigger EN LA MISMA TRANSACCION para no perder ni duplicar los cambios del sistema antiguo.
  Es repetible: se puede volver a ejecutar (simulacion) para medir el desvio.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Stock_Disponible_Conciliar
  @Aplicar          bit = 0,
  @HabilitarTrigger bit = 0,
  @Usuario          nvarchar(100) = NULL,
  @Ajustados        int = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 52100, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;
  IF @HabilitarTrigger = 1 AND @Aplicar = 0
    THROW 52101, 'Para habilitar el trigger use @Aplicar = 1 (se ajusta y se habilita en la misma transaccion).', 1;

  SET @Usuario = ISNULL(NULLIF(LTRIM(RTRIM(@Usuario)), N''), ORIGINAL_LOGIN());
  SET @Ajustados = 0;

  IF OBJECT_ID(N'tempdb..#dif') IS NOT NULL DROP TABLE #dif;

  ;WITH ms AS (
    SELECT CAST(CodPap AS nvarchar(50)) AS CodPap, CAST(ISNULL(Disponible, 0) AS decimal(18,4)) AS Disp
    FROM dbo.MaterialStock
  ), ss AS (
    SELECT CodPap, SUM(Cantidad) AS Disp FROM dbo.StockSaldo WHERE Bucket = 'Disponible' GROUP BY CodPap
  ), se AS (
    SELECT CAST(CodPap AS nvarchar(50)) AS CodPap, COUNT(*) AS Libres
    FROM dbo.DetLogistica
    WHERE IdEstado = 2 AND LEN(ISNULL(Serie, '')) > 0 AND Serie <> 'NO APLICA'
    GROUP BY CAST(CodPap AS nvarchar(50))
  )
  SELECT ms.CodPap,
         CASE WHEN LEFT(ms.CodPap, 2) = '40' OR ISNULL(se.Libres, 0) > 0 THEN 'ConSeries' ELSE 'Normal' END AS Clase,
         ms.Disp                                         AS MaterialStock,
         CASE WHEN ms.Disp > 0 THEN ms.Disp ELSE 0 END   AS Objetivo,
         ISNULL(ss.Disp, 0)                              AS StockSaldo,
         ISNULL(se.Libres, 0)                            AS SeriesLibres,
         CAST((CASE WHEN ms.Disp > 0 THEN ms.Disp ELSE 0 END) - ISNULL(ss.Disp, 0) AS decimal(18,4)) AS Delta
  INTO #dif
  FROM ms
  LEFT JOIN ss ON ss.CodPap = ms.CodPap
  LEFT JOIN se ON se.CodPap = ms.CodPap;

  DELETE FROM #dif WHERE Delta = 0;

  -- Siempre se muestra lo que hay (simulacion y aplicacion).
  SELECT d.CodPap, d.Clase, d.MaterialStock, d.StockSaldo, d.SeriesLibres, d.Delta,
         CASE WHEN d.Clase = 'ConSeries' THEN 'NO SE AJUSTA (con series: el Disponible sigue a las series)'
              WHEN d.MaterialStock < 0 THEN 'AJUSTA A 0 (MaterialStock negativo)'
              ELSE 'AJUSTA' END AS Accion
  FROM #dif d
  ORDER BY d.Clase, ABS(d.Delta) DESC;

  IF @Aplicar = 0 RETURN;

  BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
      SELECT CodPap, Delta FROM #dif WHERE Clase = 'Normal' ORDER BY CodPap;
    DECLARE @cod nvarchar(50), @delta decimal(18,4), @abs decimal(18,4), @clave nvarchar(100);
    DECLARE @stamp nvarchar(20) = FORMAT(SYSUTCDATETIME(), 'yyyyMMddHHmmss');

    OPEN c;
    FETCH NEXT FROM c INTO @cod, @delta;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @clave = CONCAT(N'CONCILIAR_DISP:', @cod, N':', @stamp);
      SET @abs = ABS(@delta);
      IF @delta > 0
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = NULL, @BucketDestino = 'Disponible', @Cantidad = @abs,
          @Operacion = 'AJUSTE', @Usuario = @Usuario,
          @Observacion = N'Conciliacion de Disponible con MaterialStock (sistema antiguo)', @ClaveIdempotencia = @clave;
      ELSE
        EXEC dbo.sp_Stock_Mover
          @CodPap = @cod, @BucketOrigen = 'Disponible', @BucketDestino = NULL, @Cantidad = @abs,
          @Operacion = 'AJUSTE', @Usuario = @Usuario,
          @Observacion = N'Conciliacion de Disponible con MaterialStock (sistema antiguo)', @ClaveIdempotencia = @clave;
      SET @Ajustados += 1;
      FETCH NEXT FROM c INTO @cod, @delta;
    END;
    CLOSE c;
    DEALLOCATE c;

    IF @HabilitarTrigger = 1
      ENABLE TRIGGER dbo.trg_MaterialStock_Ledger ON dbo.MaterialStock;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
