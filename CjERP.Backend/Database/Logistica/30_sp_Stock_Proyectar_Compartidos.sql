/*
  Logistica / Stock - la PROYECCION a MaterialStock se limita a los buckets COMPARTIDOS (migracion parcial, ambos sistemas operan).
  PV: NO ejecutado ni probado contra la BD. Reemplaza sp_Stock_ProyectarMaterialStock (script 02) y vStockDescuadres (script 03).

  Problema medido el 2026-11-27: sp_Stock_Mover llama a sp_Stock_ProyectarMaterialStock, que reescribia TODA la fila de MaterialStock
  desde StockSaldo (Stock y las 15 columnas de bucket). Las columnas de COLA (Solicitado, Aprobado, Despachado, Enviado, Campo,
  Cruce, Cierre, Folio, Culminadas, Excedente, Observada) las usa el sistema antiguo para SUS documentos (CabSolicitud.IdWeb NULL):
  72 materiales las tenian cambiadas respecto a la copia bkp.MaterialStock_20261127_0926.

  Nueva regla:
    - Se proyectan SOLO Disponible, Bloqueado, Recepcionado y Validado (los buckets compartidos).
    - Las columnas de cola de MaterialStock NO se tocan: son del sistema antiguo.
    - Stock (total) se mueve con el cambio de los compartidos (Stock = Stock + delta), igual que lo hace el sistema antiguo al
      importar. Un material nuevo se inserta con las colas en 0.
    - El libro (StockSaldo/StockMovimiento) sigue llevando todos los buckets para los documentos del sistema nuevo.
  vStockDescuadres: solo compara los buckets compartidos y excluye materiales con series (CodPap 40*), cuyo Disponible sigue a
  DetLogistica; mantiene los SALDO NEGATIVO del libro. Las colas ya no son comparables por diseno.

  Reversa: ejecutar de nuevo sp_Stock_ProyectarMaterialStock y vStockDescuadres de 02/03 (el texto previo esta tambien en
  bkp.Definiciones_<sufijo> del script 28).
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Stock_ProyectarMaterialStock
  @CodPap nvarchar(50)
AS
BEGIN
  SET NOCOUNT ON;

  -- Evita que el trigger de captura vuelva a registrar este cambio.
  EXEC sys.sp_set_session_context @key = N'StockSync', @value = 1;

  BEGIN TRY
    DECLARE @disp numeric(18,4), @bloq numeric(18,4), @rec numeric(18,4), @val numeric(18,4);

    SELECT
      @disp = ISNULL(SUM(CASE WHEN Bucket = 'Disponible'   THEN Cantidad END), 0),
      @bloq = ISNULL(SUM(CASE WHEN Bucket = 'Bloqueado'    THEN Cantidad END), 0),
      @rec  = ISNULL(SUM(CASE WHEN Bucket = 'Recepcionado' THEN Cantidad END), 0),
      @val  = ISNULL(SUM(CASE WHEN Bucket = 'Validado'     THEN Cantidad END), 0)
    FROM dbo.StockSaldo
    WHERE CodPap = @CodPap;

    UPDATE dbo.MaterialStock
    SET Stock = ISNULL(Stock, 0)
              + (@disp + @bloq + @rec + @val)
              - (ISNULL(Disponible, 0) + ISNULL(Bloqueado, 0) + ISNULL(Recepcionado, 0) + ISNULL(Validado, 0)),
        Disponible = @disp, Bloqueado = @bloq, Recepcionado = @rec, Validado = @val
    WHERE CodPap = @CodPap;

    IF @@ROWCOUNT = 0
      INSERT INTO dbo.MaterialStock
        (CodPap, Stock, Bloqueado, Disponible, Solicitado, Aprobado, Despachado, Enviado, Campo, Cruce, Cierre,
         Excedente, Folio, Culminadas, Fecha, Hora, IdEstado, Recepcionado, Validado, Observada)
      VALUES
        (@CodPap, @disp + @bloq + @rec + @val, @bloq, @disp, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, CAST(GETDATE() AS date), GETDATE(), 1, @rec, @val, 0);
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
    THROW;
  END CATCH;

  EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
END;
GO

CREATE OR ALTER VIEW dbo.vStockDescuadres
AS
SELECT CodPap, Bucket, EnMaterialStock, EnStockSaldo, Diferencia,
       CASE WHEN EnStockSaldo < 0 THEN N'SALDO NEGATIVO' ELSE N'DIFERENCIA' END AS Tipo
FROM dbo.vStockConciliacion
WHERE EnStockSaldo < 0
   OR (Diferencia <> 0
       AND Bucket IN ('Recepcionado', 'Validado', 'Disponible', 'Bloqueado')
       AND LEFT(CAST(CodPap AS nvarchar(50)), 2) <> N'40');
GO
