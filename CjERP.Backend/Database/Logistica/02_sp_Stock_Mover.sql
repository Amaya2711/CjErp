/*
  Logistica / Stock - sp_Stock_Mover y sp_Stock_ProyectarMaterialStock.
  PV: no ejecutado ni probado contra la BD.

  sp_Stock_Mover es el UNICO punto que modifica StockSaldo. En una transaccion:
    1) valida parametros y buckets,
    2) respeta la idempotencia (misma ClaveIdempotencia => no repite el movimiento),
    3) descuenta del bucket origen solo si alcanza (bloqueando la fila) y suma al destino,
    4) registra el movimiento en el libro,
    5) proyecta el resultado a dbo.MaterialStock (compatibilidad con el sistema antiguo y reportes).
  Si se invoca dentro de una transaccion del llamador, usa esa transaccion (errores => el llamador hace rollback).
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Stock_ProyectarMaterialStock
  @CodPap nvarchar(50)
AS
BEGIN
  SET NOCOUNT ON;

  -- Evita que el trigger de captura (04_trg_MaterialStock_Ledger.sql) vuelva a registrar este cambio.
  EXEC sys.sp_set_session_context @key = N'StockSync', @value = 1;

  BEGIN TRY
    DECLARE @disp numeric(18,4), @bloq numeric(18,4), @sol numeric(18,4), @apr numeric(18,4), @desp numeric(18,4),
            @env numeric(18,4), @camp numeric(18,4), @cruc numeric(18,4), @cier numeric(18,4), @exc numeric(18,4),
            @fol numeric(18,4), @culm numeric(18,4), @rec numeric(18,4), @val numeric(18,4), @obs numeric(18,4);

    SELECT
      @disp = ISNULL(SUM(CASE WHEN Bucket = 'Disponible'   THEN Cantidad END), 0),
      @bloq = ISNULL(SUM(CASE WHEN Bucket = 'Bloqueado'    THEN Cantidad END), 0),
      @sol  = ISNULL(SUM(CASE WHEN Bucket = 'Solicitado'   THEN Cantidad END), 0),
      @apr  = ISNULL(SUM(CASE WHEN Bucket = 'Aprobado'     THEN Cantidad END), 0),
      @desp = ISNULL(SUM(CASE WHEN Bucket = 'Despachado'   THEN Cantidad END), 0),
      @env  = ISNULL(SUM(CASE WHEN Bucket = 'Enviado'      THEN Cantidad END), 0),
      @camp = ISNULL(SUM(CASE WHEN Bucket = 'Campo'        THEN Cantidad END), 0),
      @cruc = ISNULL(SUM(CASE WHEN Bucket = 'Cruce'        THEN Cantidad END), 0),
      @cier = ISNULL(SUM(CASE WHEN Bucket = 'Cierre'       THEN Cantidad END), 0),
      @exc  = ISNULL(SUM(CASE WHEN Bucket = 'Excedente'    THEN Cantidad END), 0),
      @fol  = ISNULL(SUM(CASE WHEN Bucket = 'Folio'        THEN Cantidad END), 0),
      @culm = ISNULL(SUM(CASE WHEN Bucket = 'Culminadas'   THEN Cantidad END), 0),
      @rec  = ISNULL(SUM(CASE WHEN Bucket = 'Recepcionado' THEN Cantidad END), 0),
      @val  = ISNULL(SUM(CASE WHEN Bucket = 'Validado'     THEN Cantidad END), 0),
      @obs  = ISNULL(SUM(CASE WHEN Bucket = 'Observada'    THEN Cantidad END), 0)
    FROM dbo.StockSaldo
    WHERE CodPap = @CodPap;

    DECLARE @total numeric(18,4) = @disp + @bloq + @sol + @apr + @desp + @env + @camp + @cruc + @cier + @exc + @fol + @culm + @rec + @val + @obs;

    UPDATE dbo.MaterialStock
    SET Stock = @total, Disponible = @disp, Bloqueado = @bloq, Solicitado = @sol, Aprobado = @apr, Despachado = @desp,
        Enviado = @env, Campo = @camp, Cruce = @cruc, Cierre = @cier, Excedente = @exc, Folio = @fol, Culminadas = @culm,
        Recepcionado = @rec, Validado = @val, Observada = @obs
    WHERE CodPap = @CodPap;

    IF @@ROWCOUNT = 0
      INSERT INTO dbo.MaterialStock
        (CodPap, Stock, Bloqueado, Disponible, Solicitado, Aprobado, Despachado, Enviado, Campo, Cruce, Cierre,
         Excedente, Folio, Culminadas, Fecha, Hora, IdEstado, Recepcionado, Validado, Observada)
      VALUES
        (@CodPap, @total, @bloq, @disp, @sol, @apr, @desp, @env, @camp, @cruc, @cier,
         @exc, @fol, @culm, CAST(GETDATE() AS date), GETDATE(), 1, @rec, @val, @obs);
  END TRY
  BEGIN CATCH
    EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
    THROW;
  END CATCH;

  EXEC sys.sp_set_session_context @key = N'StockSync', @value = 0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Stock_Mover
  @CodPap             nvarchar(50),
  @BucketOrigen       varchar(20)   = NULL,   -- NULL = entrada (no descuenta de ningun bucket)
  @BucketDestino      varchar(20)   = NULL,   -- NULL = salida (no suma a ningun bucket)
  @Cantidad           decimal(18,4),
  @Operacion          varchar(40),
  @IdAlmacen          int           = 0,
  @Serie              nvarchar(100) = NULL,
  @NroSolicitud       nvarchar(50)  = NULL,
  @Posicion           nvarchar(50)  = NULL,
  @CorrelativoDet     nvarchar(50)  = NULL,
  @IdEstadoDoc        int           = NULL,
  @Usuario            nvarchar(100) = NULL,
  @IdEmpleadoCj       int           = NULL,
  @Observacion        nvarchar(500) = NULL,
  @ClaveIdempotencia  nvarchar(100) = NULL,
  @PermitirNegativo   bit           = 0,      -- solo para regularizaciones autorizadas
  @IdMovimiento       bigint        = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @CodPap IS NULL OR LTRIM(RTRIM(@CodPap)) = N''
    THROW 51010, 'CodPap es obligatorio.', 1;
  IF @Cantidad IS NULL OR @Cantidad <= 0
    THROW 51011, 'La cantidad debe ser mayor que cero.', 1;
  IF @BucketOrigen IS NULL AND @BucketDestino IS NULL
    THROW 51012, 'Debe indicar bucket de origen o de destino.', 1;
  IF @BucketOrigen IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.StockBucket WHERE Bucket = @BucketOrigen)
    THROW 51013, 'Bucket de origen no valido.', 1;
  IF @BucketDestino IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.StockBucket WHERE Bucket = @BucketDestino)
    THROW 51014, 'Bucket de destino no valido.', 1;
  IF @BucketOrigen IS NOT NULL AND @BucketOrigen = @BucketDestino
    THROW 51015, 'El bucket de origen y el de destino no pueden ser el mismo.', 1;

  SET @IdAlmacen = ISNULL(@IdAlmacen, 0);

  IF @ClaveIdempotencia IS NOT NULL
  BEGIN
    SELECT @IdMovimiento = IdMovimiento FROM dbo.StockMovimiento WHERE ClaveIdempotencia = @ClaveIdempotencia;
    IF @IdMovimiento IS NOT NULL RETURN;   -- ya aplicado: no se repite
  END;

  DECLARE @propia bit = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
  IF @propia = 1 BEGIN TRANSACTION;

  BEGIN TRY
    -- Asegura la existencia de las filas de saldo (con HOLDLOCK para evitar duplicados concurrentes).
    IF @BucketOrigen IS NOT NULL
      MERGE dbo.StockSaldo WITH (HOLDLOCK) AS t
      USING (SELECT @CodPap AS CodPap, @IdAlmacen AS IdAlmacen, @BucketOrigen AS Bucket) AS s
        ON t.CodPap = s.CodPap AND t.IdAlmacen = s.IdAlmacen AND t.Bucket = s.Bucket
      WHEN NOT MATCHED THEN INSERT (CodPap, IdAlmacen, Bucket, Cantidad) VALUES (s.CodPap, s.IdAlmacen, s.Bucket, 0);

    IF @BucketDestino IS NOT NULL
      MERGE dbo.StockSaldo WITH (HOLDLOCK) AS t
      USING (SELECT @CodPap AS CodPap, @IdAlmacen AS IdAlmacen, @BucketDestino AS Bucket) AS s
        ON t.CodPap = s.CodPap AND t.IdAlmacen = s.IdAlmacen AND t.Bucket = s.Bucket
      WHEN NOT MATCHED THEN INSERT (CodPap, IdAlmacen, Bucket, Cantidad) VALUES (s.CodPap, s.IdAlmacen, s.Bucket, 0);

    -- Descuento atomico: solo si alcanza (o se autoriza negativo).
    IF @BucketOrigen IS NOT NULL
    BEGIN
      UPDATE dbo.StockSaldo WITH (UPDLOCK, ROWLOCK)
      SET Cantidad = Cantidad - @Cantidad, FechaModificacion = SYSUTCDATETIME()
      WHERE CodPap = @CodPap AND IdAlmacen = @IdAlmacen AND Bucket = @BucketOrigen
        AND (Cantidad >= @Cantidad OR @PermitirNegativo = 1);

      IF @@ROWCOUNT = 0
      BEGIN
        DECLARE @msg nvarchar(300) = CONCAT(N'Stock insuficiente de ', @CodPap, N' en ', @BucketOrigen, N' (se requieren ', CONVERT(nvarchar(30), @Cantidad), N').');
        THROW 51001, @msg, 1;
      END;
    END;

    IF @BucketDestino IS NOT NULL
      UPDATE dbo.StockSaldo WITH (UPDLOCK, ROWLOCK)
      SET Cantidad = Cantidad + @Cantidad, FechaModificacion = SYSUTCDATETIME()
      WHERE CodPap = @CodPap AND IdAlmacen = @IdAlmacen AND Bucket = @BucketDestino;

    INSERT INTO dbo.StockMovimiento
      (CodPap, IdAlmacen, Serie, BucketOrigen, BucketDestino, Cantidad, Operacion, NroSolicitud, Posicion, CorrelativoDet,
       IdEstadoDoc, Usuario, IdEmpleadoCj, Observacion, ClaveIdempotencia)
    VALUES
      (@CodPap, @IdAlmacen, @Serie, @BucketOrigen, @BucketDestino, @Cantidad, @Operacion, @NroSolicitud, @Posicion, @CorrelativoDet,
       @IdEstadoDoc, @Usuario, @IdEmpleadoCj, @Observacion, @ClaveIdempotencia);

    SET @IdMovimiento = CAST(SCOPE_IDENTITY() AS bigint);

    EXEC dbo.sp_Stock_ProyectarMaterialStock @CodPap = @CodPap;

    IF @propia = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @propia = 1 AND XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
