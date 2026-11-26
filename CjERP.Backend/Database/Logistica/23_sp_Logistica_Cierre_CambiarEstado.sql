/*
  Logistica de equipos - pagina CIERRE: cambiar el estado de UNA linea desde la grilla de x Cruzar / x Cerrar / x Foliar.
  PV: NO ejecutado ni probado contra la BD. Requiere los scripts de stock 01 a 05 (sp_Stock_Mover) y el script 09.
  Replica GrabarCruce / GrabarCierre / GrabarFolio del sistema antiguo siguiendo LogisticaEtapaConfig (script 01):

    Etapa   Estados de origen        Estados que se pueden elegir        Stock de la cantidad conforme
    CRUCE   14                       21, 22, 23, 25                       Cruce  -> Cierre
    CIERRE  21, 7, 22, 23, 24, 25    16 (x foliar), 17, 10, 20            Cierre -> Folio (16) | Culminadas (20, o 16 si no aplica folio)
    FOLIO   16                       10, 16, 17, 20                       Folio  -> Observada (10) | Excedente (17) | Culminadas (20); 16 = sigue en x foliar (solo con diferencia)
    Estado POR DEFECTO cuando no se elige ninguno (la grilla de x Cerrar / x Foliar solo ofrece 10, 16 y 17): x Cruzar 21;
    x Cerrar 16 para materiales 10 y 40 y 20 para los demas; x Foliar 20. Lo decide el frontend (CAMBIO_ESTADO en cierre.tsx);
    el SP solo valida que sea permitido (y convierte 16 en 20 si el material no aplica folio).

  Destino del stock segun el estado elegido: 21, 22, 23 y 25 Cierre; 16 Folio; 20 Culminadas; 17 Excedente; 10 Observada.
  En x Cruzar el 17 no se elige: lo crea el SP solo con la diferencia (cantidad conforme menor).
  - @Cantidad = cantidad conforme (0..CantSap de la linea). Si es menor, la DIFERENCIA se separa en una linea nueva en
    estado 17 (excedente) y su stock pasa del bucket de origen a Excedente (vuelve a Disponible al recoger el excedente).
    La linea original queda con la cantidad conforme y el estado elegido. Con cantidad 0, toda la linea pasa a 17.
  - Con estado 10 o con diferencia la observacion es obligatoria.
  - Estado 16 (x foliar) solo aplica a materiales 10 y 40; si se elige 16 para otro material, la linea pasa directo a 20 (culminado).
  - Todo en una transaccion: si falta stock en el bucket de origen (51001) se revierte todo.
  - No genera numero de cierre, PDF ni correo (el sistema antiguo lo hacia al cerrar).

  Este script tambien crea dbo.sp_Logistica_Cierre_ActualizarLinea: edicion directa de la Serie, la Observacion o el Monto de envio
  de UNA linea (DetSolicitud.Serie / Observacion / MontoEnvio), en cualquier estado, desde las columnas de la grilla de Cierre.
  Solo actualiza DetSolicitud (no toca DetLogistica ni stock).

  AUDITORIA: ambos SP registran sus UPDATE (valor anterior y nuevo) en dbo.AuditoriaCambios con dbo.sp_Logistica_Auditar
  (script 24, ejecutarlo ANTES que este). Los INSERT (la linea de excedente, MovMaterial, Kardex) no se auditan. El movimiento
  de stock queda en su propio libro (StockMovimiento, via sp_Stock_Mover).
*/
SET NOCOUNT ON;
GO
CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Cierre_CambiarEstado
  @NroSolicitud  nvarchar(50),
  @Posicion      nvarchar(20),
  @Correlativo   nvarchar(50)  = NULL,
  @IdEstado      int,
  @Cantidad      decimal(18,4) = NULL,
  @Observacion   nvarchar(500) = NULL,
  @Usuario       nvarchar(50)  = NULL,
  @IdEmpleadoCj  int           = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51320, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;

  SET @NroSolicitud = LTRIM(RTRIM(@NroSolicitud));
  SET @Posicion = LTRIM(RTRIM(@Posicion));
  SET @Correlativo = NULLIF(LTRIM(RTRIM(@Correlativo)), N'');
  SET @Observacion = NULLIF(LTRIM(RTRIM(@Observacion)), N'');

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);

  DECLARE @n int, @cod nvarchar(50), @cant decimal(18,4), @s0 int, @corr nvarchar(50), @serie nvarchar(100), @obsActual nvarchar(500),
          @pedido nvarchar(50), @idCli int, @idProy int, @idSite nvarchar(50), @correSite int, @tipo nvarchar(100);

  SELECT @n = COUNT(*)
  FROM dbo.DetSolicitud b
  WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
    AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo) AND b.IdDespacho = 1;
  IF @n = 0 THROW 51321, 'La linea no existe. Vuelva a consultar.', 1;
  IF @n > 1 THROW 51322, 'Hay mas de una linea con ese numero de solicitud y posicion; indique el correlativo.', 1;

  SELECT @cod = CAST(b.CodPap AS nvarchar(50)), @cant = b.CantSap, @s0 = b.IdEstado, @corr = CAST(b.Correlativo AS nvarchar(50)),
         @serie = CAST(b.Serie AS nvarchar(100)), @obsActual = CAST(b.Observacion AS nvarchar(500)), @pedido = CAST(b.PedidoSap AS nvarchar(50)),
         @idCli = b.IdCliente, @idProy = b.IdProyecto, @idSite = CAST(b.IdSite AS nvarchar(50)), @correSite = b.CorreSite,
         @tipo = CAST(b.TipoTrabajo AS nvarchar(100))
  FROM dbo.DetSolicitud b
  WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
    AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo) AND b.IdDespacho = 1;

  DECLARE @etapa varchar(10) = CASE WHEN @s0 = 14 THEN 'CRUCE'
                                    WHEN @s0 IN (21, 7, 22, 23, 24, 25) THEN 'CIERRE'
                                    WHEN @s0 = 16 THEN 'FOLIO' END;
  IF @etapa IS NULL
    THROW 51323, 'La linea esta en un estado que no se modifica desde esta pagina (14, 21, 7, 22, 23, 24, 25 o 16). Vuelva a consultar.', 1;
  IF NOT ((@etapa = 'CRUCE' AND @IdEstado IN (21, 22, 23, 25))
       OR (@etapa = 'CIERRE' AND @IdEstado IN (16, 17, 10, 20))
       OR (@etapa = 'FOLIO' AND @IdEstado IN (16, 17, 10, 20)))
    THROW 51324, 'Estado no permitido para la etapa de la linea.', 1;
  -- x Foliar: elegir 16 (la linea ya esta ahi) solo tiene efecto si la cantidad conforme es menor (la diferencia pasa a excedente).
  IF @etapa = 'FOLIO' AND @IdEstado = 16 AND ISNULL(@Cantidad, @cant) >= @cant
    THROW 51332, 'La linea ya esta en x foliar (16): elija 10 o 17, o indique una cantidad conforme menor.', 1;

  DECLARE @conf decimal(18,4) = ISNULL(@Cantidad, @cant);
  IF @conf < 0 OR @conf > @cant
    THROW 51326, 'La cantidad conforme debe estar entre 0 y la cantidad de la linea (admite decimales).', 1;

  DECLARE @dif decimal(18,4) = @cant - @conf;
  DECLARE @estadoFinal int = @IdEstado;
  -- Material que no aplica folio (no es 10 ni 40): del cierre pasa directo a culminado, como el sistema antiguo.
  IF @IdEstado = 16 AND LEFT(@cod, 2) NOT IN (N'10', N'40') SET @estadoFinal = 20;
  IF @conf = 0
  BEGIN
    -- Nada conforme: toda la linea pasa a excedente, sin dejar una linea en cero.
    SET @conf = @cant;
    SET @dif = 0;
    SET @estadoFinal = 17;
  END
  ELSE IF @dif > 0 AND @IdEstado = 17
    -- Se pidio excedente pero hay parte conforme: esa parte sigue el flujo normal de la etapa y la diferencia es el excedente.
    SET @estadoFinal = CASE WHEN @etapa = 'FOLIO' THEN 16
                            WHEN @etapa = 'CRUCE' THEN 21
                            WHEN @etapa = 'CIERRE' AND LEFT(@cod, 2) IN (N'10', N'40') THEN 16
                            ELSE 20 END;

  DECLARE @obs nvarchar(500) = COALESCE(@Observacion, @obsActual);
  IF (@estadoFinal = 10 OR @dif > 0 OR @estadoFinal = 17) AND @obs IS NULL
    THROW 51327, 'Para observar o dejar excedente (estado 10 / 17 o cantidad distinta) la observacion es obligatoria.', 1;

  DECLARE @b0 varchar(20) = CASE @etapa WHEN 'CRUCE' THEN 'Cruce' WHEN 'CIERRE' THEN 'Cierre' ELSE 'Folio' END;
  DECLARE @be varchar(20) = CASE WHEN @estadoFinal IN (21, 22, 23, 25) THEN 'Cierre' WHEN @estadoFinal = 16 THEN 'Folio' WHEN @estadoFinal = 20 THEN 'Culminadas'
                                              WHEN @estadoFinal = 17 THEN 'Excedente' WHEN @estadoFinal = 10 THEN 'Observada' END;
  DECLARE @pos int = TRY_CONVERT(int, @Posicion);

  -- Auditoria de los UPDATE (no de los INSERT) en dbo.AuditoriaCambios, via dbo.sp_Logistica_Auditar (script 24).
  IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
    THROW 51340, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;
  DECLARE @idReg nvarchar(100) = CONCAT(@NroSolicitud, N'-', @Posicion);
  CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                     ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Cambia la linea solo si sigue en el estado de origen (evita doble proceso si dos personas la tocan a la vez).
    UPDATE b
       SET b.IdEstado = @estadoFinal, b.CantSap = @conf, b.Observacion = COALESCE(@obs, b.Observacion),
           b.FechaCruce   = CASE WHEN @etapa = 'CRUCE'  THEN @hoy          ELSE b.FechaCruce END,
           b.IdRespCruce  = CASE WHEN @etapa = 'CRUCE'  THEN @IdEmpleadoCj ELSE b.IdRespCruce END,
           b.CantCruce    = CASE WHEN @etapa = 'CRUCE'  THEN @conf         ELSE b.CantCruce END,
           b.FechaCierre  = CASE WHEN @etapa = 'CIERRE' THEN @hoy          ELSE b.FechaCierre END,
           b.IdRespCierre = CASE WHEN @etapa = 'CIERRE' THEN @IdEmpleadoCj ELSE b.IdRespCierre END,
           b.CantCierre   = CASE WHEN @etapa IN ('CIERRE', 'FOLIO') THEN @conf ELSE b.CantCierre END,
           b.FechaTermino = CASE WHEN @etapa = 'FOLIO'  THEN @hoy          ELSE b.FechaTermino END,
           b.IdRespTermino= CASE WHEN @etapa = 'FOLIO'  THEN @IdEmpleadoCj ELSE b.IdRespTermino END,
           b.CantFolio    = CASE WHEN @etapa = 'FOLIO'  THEN @conf         ELSE b.CantFolio END
    FROM dbo.DetSolicitud b
    WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
      AND CAST(b.Correlativo AS nvarchar(50)) = @corr AND b.IdDespacho = 1 AND b.IdEstado = @s0;
    IF @@ROWCOUNT = 0
      THROW 51328, 'La linea cambio de estado mientras tanto. Vuelva a consultar.', 1;

    -- Auditoria: lo que cambio la linea (valor anterior -> nuevo).
    INSERT INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    VALUES (N'DetSolicitud', @idReg, @etapa, N'IdEstado', CONVERT(nvarchar(50), @s0), CONVERT(nvarchar(50), @estadoFinal)),
           (N'DetSolicitud', @idReg, @etapa, N'CantSap', CONVERT(nvarchar(50), @cant), CONVERT(nvarchar(50), @conf)),
           (N'DetSolicitud', @idReg, @etapa, N'Observacion', @obsActual, COALESCE(@obs, @obsActual));

    -- Diferencia: linea nueva en estado 17 (excedente), con una posicion libre dentro de la solicitud.
    IF @dif > 0
    BEGIN
      DECLARE @posNueva varchar(20) = CONVERT(varchar(20),
        (SELECT ISNULL(MAX(TRY_CONVERT(int, d.Posicion)), -1) + 1 FROM dbo.DetSolicitud d
         WHERE CAST(d.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND d.IdDespacho = 1));

      INSERT INTO dbo.DetSolicitud
        (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, Correlativo, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
         Usuario, Fecha, Hora, IdEstado, Observacion, NroEnvio, IdClienteOrigen, IdProyectoOrigen, IdSiteOrigen, CorreSiteOrigen,
         TipoTrabajoOrigen, NroSolicitud, Serie, IdDespacho, FechaSolicitud, IdRespSolicitud, FechaAprobar, ImagenSolicitud, CantDesp, IdBloqueo,
         RutaImagen, ImagenEnvio, NroGuia)
      SELECT b.IdCliente, b.IdProyecto, b.IdSite, b.CorreSite, b.TipoTrabajo, b.PedidoSap, b.Correlativo, b.CodPap, @posNueva, @dif, b.Centro, b.Almacen, b.Lote,
             ISNULL(@Usuario, b.Usuario), @hoy, @ahora, 17, @obs, b.NroEnvio, b.IdClienteOrigen, b.IdProyectoOrigen, b.IdSiteOrigen, b.CorreSiteOrigen,
             b.TipoTrabajoOrigen, b.NroSolicitud, b.Serie, 1, b.FechaSolicitud, b.IdRespSolicitud, b.FechaAprobar, b.ImagenSolicitud, @dif, 0,
             b.RutaImagen, b.ImagenEnvio, b.NroGuia
      FROM dbo.DetSolicitud b
      WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
        AND CAST(b.Correlativo AS nvarchar(50)) = @corr AND b.IdDespacho = 1;
    END;

    -- Cabecera: 11 si queda algo en campo; si no, la etapa mas atrasada que tenga alguna linea.
    UPDATE a
       SET a.IdEstado = CASE
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 11) THEN 11
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 14) THEN 14
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado IN (21, 7, 22, 23, 24, 25)) THEN 21
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 16) THEN 16
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 17) THEN 17
             WHEN EXISTS (SELECT 1 FROM dbo.DetSolicitud d WHERE d.NroSolicitud = a.NroSolicitud AND d.IdDespacho = 1 AND d.IdEstado = 10) THEN 10
             ELSE 20 END
    OUTPUT N'CabSolicitud', CONVERT(nvarchar(100), inserted.NroSolicitud), NULL, N'IdEstado',
           CONVERT(nvarchar(50), deleted.IdEstado), CONVERT(nvarchar(50), inserted.IdEstado)
      INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    FROM dbo.CabSolicitud a
    WHERE CAST(a.NroSolicitud AS nvarchar(50)) = @NroSolicitud;

    -- Registra en AuditoriaCambios los UPDATE de la linea y de la cabecera (el INSERT de la linea de excedente no se audita).
    UPDATE #Aud SET Seccion = @etapa WHERE Seccion IS NULL;
    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    VALUES (ISNULL(@pedido, ''), @corr, @Posicion, @estadoFinal, @Usuario, @hoy, @ahora, ISNULL(@obs, ''), @cod, @conf, @NroSolicitud, 1,
            @idCli, @idProy, @idSite, @correSite, @tipo, @IdEmpleadoCj);

    IF @dif > 0
      INSERT INTO dbo.MovMaterial
        (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
         IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
      VALUES (ISNULL(@pedido, ''), @corr, @posNueva, 17, @Usuario, @hoy, @ahora, ISNULL(@obs, ''), @cod, @dif, @NroSolicitud, 3,
              @idCli, @idProy, @idSite, @correSite, @tipo, @IdEmpleadoCj);

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    VALUES (3, @conf, @cod, 0, 0, @etapa, @idCli, @idProy, @idSite, @correSite, @IdEmpleadoCj, @hoy, @ahora, @s0, @NroSolicitud, @pos, ISNULL(@serie, ''));

    IF @dif > 0
      INSERT INTO dbo.Kardex
        (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
         IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
      VALUES (3, @dif, @cod, 0, 0, CONCAT('DEV-', @etapa), @idCli, @idProy, @idSite, @correSite, @IdEmpleadoCj, @hoy, @ahora, @s0, @NroSolicitud, @pos, ISNULL(@serie, ''));

    -- Stock: lo conforme del bucket de la etapa al del estado elegido; la diferencia, a Excedente. Falla si no alcanza (51001).
    DECLARE @op varchar(40) = @etapa;
    -- Si el bucket de origen y el de destino son el mismo (x Foliar que sigue en 16 con diferencia), lo conforme no se mueve.
    IF @b0 <> @be
    EXEC dbo.sp_Stock_Mover
      @CodPap = @cod, @BucketOrigen = @b0, @BucketDestino = @be, @Cantidad = @conf,
      @Operacion = @op, @NroSolicitud = @NroSolicitud, @Posicion = @Posicion, @CorrelativoDet = @corr,
      @IdEstadoDoc = @estadoFinal, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs;

    IF @dif > 0
    BEGIN
      SET @op = CONCAT(@etapa, '_DIF');
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = @b0, @BucketDestino = 'Excedente', @Cantidad = @dif,
        @Operacion = @op, @NroSolicitud = @NroSolicitud, @Posicion = @posNueva, @CorrelativoDet = @corr,
        @IdEstadoDoc = 17, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = @obs;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Cierre_ActualizarLinea
  @NroSolicitud  nvarchar(50),
  @Posicion      nvarchar(20),
  @Correlativo   nvarchar(50)  = NULL,
  @Campo         nvarchar(20),           -- 'serie', 'observacion' o 'montoenvio'
  @Valor         nvarchar(500) = NULL,   -- NULL o vacio = limpiar el campo (montoenvio: 0); montoenvio con punto decimal, p. ej. 12.50
  @Usuario       nvarchar(50)  = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  SET @NroSolicitud = LTRIM(RTRIM(@NroSolicitud));
  SET @Posicion = LTRIM(RTRIM(@Posicion));
  SET @Correlativo = NULLIF(LTRIM(RTRIM(@Correlativo)), N'');
  SET @Campo = LOWER(LTRIM(RTRIM(@Campo)));
  SET @Valor = NULLIF(LTRIM(RTRIM(@Valor)), N'');

  IF @Campo NOT IN (N'serie', N'observacion', N'montoenvio')
    THROW 51331, 'Campo no editable en Cierre (use serie, observacion o montoenvio).', 1;

  -- Monto de envio: numero >= 0 con 2 decimales (vacio = 0).
  DECLARE @monto numeric(18,2) = NULL;
  IF @Campo = N'montoenvio'
  BEGIN
    SET @monto = CASE WHEN @Valor IS NULL THEN 0 ELSE TRY_CONVERT(numeric(18,2), @Valor) END;
    IF @monto IS NULL OR @monto < 0
      THROW 51342, 'El monto de envio debe ser un numero mayor o igual a 0 (hasta 2 decimales).', 1;
  END;
  IF OBJECT_ID(N'dbo.sp_Logistica_Auditar', N'P') IS NULL
    THROW 51340, 'Falta dbo.sp_Logistica_Auditar (ejecute el script 24).', 1;

  DECLARE @n int;
  SELECT @n = COUNT(*)
  FROM dbo.DetSolicitud b
  WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
    AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo) AND b.IdDespacho = 1;
  IF @n = 0 THROW 51329, 'La linea no existe. Vuelva a consultar.', 1;
  IF @n > 1 THROW 51330, 'Hay mas de una linea con ese numero de solicitud y posicion; indique el correlativo.', 1;

  CREATE TABLE #Aud (Entidad nvarchar(100), IdRegistro nvarchar(100), Seccion nvarchar(100) NULL, Campo nvarchar(100),
                     ValorAnterior nvarchar(max) NULL, ValorNuevo nvarchar(max) NULL);

  BEGIN TRY
    BEGIN TRANSACTION;

    -- OUTPUT deleted/inserted: el valor anterior y el nuevo del campo editado, para la auditoria.
    UPDATE b
       SET b.Serie       = CASE WHEN @Campo = N'serie'       THEN ISNULL(@Valor, '') ELSE b.Serie END,
           b.Observacion = CASE WHEN @Campo = N'observacion' THEN ISNULL(@Valor, '') ELSE b.Observacion END,
           b.MontoEnvio  = CASE WHEN @Campo = N'montoenvio'  THEN @monto ELSE b.MontoEnvio END
    OUTPUT N'DetSolicitud', CONCAT(@NroSolicitud, N'-', @Posicion), N'CIERRE',
           CASE @Campo WHEN N'serie' THEN N'Serie' WHEN N'montoenvio' THEN N'MontoEnvio' ELSE N'Observacion' END,
           CASE @Campo WHEN N'serie' THEN CAST(deleted.Serie AS nvarchar(max))
                       WHEN N'montoenvio' THEN CONVERT(nvarchar(50), deleted.MontoEnvio)
                       ELSE CAST(deleted.Observacion AS nvarchar(max)) END,
           CASE @Campo WHEN N'serie' THEN CAST(inserted.Serie AS nvarchar(max))
                       WHEN N'montoenvio' THEN CONVERT(nvarchar(50), inserted.MontoEnvio)
                       ELSE CAST(inserted.Observacion AS nvarchar(max)) END
      INTO #Aud (Entidad, IdRegistro, Seccion, Campo, ValorAnterior, ValorNuevo)
    FROM dbo.DetSolicitud b
    WHERE CAST(b.NroSolicitud AS nvarchar(50)) = @NroSolicitud AND CAST(b.Posicion AS nvarchar(20)) = @Posicion
      AND (@Correlativo IS NULL OR CAST(b.Correlativo AS nvarchar(50)) = @Correlativo) AND b.IdDespacho = 1;

    EXEC dbo.sp_Logistica_Auditar @Usuario = @Usuario;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
