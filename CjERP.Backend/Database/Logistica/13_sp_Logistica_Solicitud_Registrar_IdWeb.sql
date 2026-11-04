/*
  Logistica de equipos - sp_Logistica_Solicitud_Registrar: graba CabSolicitud.IdWeb = 1 (solicitud registrada desde la web).
  Contiene SOLO este SP (mismo cuerpo que el vigente en JC_Db al 04/11/2026 + la columna IdWeb); es el mismo bloque que
  Database/Logistica/08. PV: la columna dbo.CabSolicitud.IdWeb debe existir antes de ejecutar (ya agregada segun el usuario).
  ANTES de ejecutar: comparar con el SP vigente en la BD (Script as ALTER); solo debe diferir en IdWeb.
*/
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_Logistica_Solicitud_Registrar
  @IdCliente      int,
  @IdProyecto     int,
  @IdSite         nvarchar(50),
  @CorreSite      int,
  @TipoTrabajo    nvarchar(100),
  @IdSolicitante  int,
  @FormaEnvio     int,
  @RazonSocial    int,
  @Ubigeo         nvarchar(20),
  @Direccion      nvarchar(300),
  @Referencia     nvarchar(300) = NULL,
  @IdConEntrega1  int,
  @IdConEntrega2  int           = NULL,
  @ImagenSolicitud nvarchar(500) = NULL,
  @Items          nvarchar(max),
  @Usuario        nvarchar(50),
  @IdEmpleadoCj   int           = NULL,
  @NroSolicitud   nvarchar(50)  OUTPUT,
  @IdEstado       int           OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF OBJECT_ID(N'dbo.sp_Stock_Mover', N'P') IS NULL
    THROW 51201, 'Falta dbo.sp_Stock_Mover (ejecute los scripts de stock 01 a 05).', 1;

  DECLARE @ahora datetime = CONVERT(datetime, SYSDATETIMEOFFSET() AT TIME ZONE 'SA Pacific Standard Time');
  DECLARE @hoy date = CAST(@ahora AS date);
  SET @IdSite = LTRIM(RTRIM(@IdSite));
  SET @TipoTrabajo = LTRIM(RTRIM(@TipoTrabajo));

  DECLARE @t TABLE (Seq int IDENTITY(1,1) PRIMARY KEY, Correlativo uniqueidentifier NULL, CodPap nvarchar(50) NOT NULL, Cant decimal(18,4) NOT NULL);
  INSERT INTO @t (Correlativo, CodPap, Cant)
  SELECT TRY_CONVERT(uniqueidentifier, NULLIF(j.correlativo, N'')), LTRIM(RTRIM(j.codPap)), j.cantidad
  FROM OPENJSON(@Items) WITH (correlativo nvarchar(40) '$.correlativo', codPap nvarchar(50) '$.codPap', cantidad decimal(18,4) '$.cantidad') j
  WHERE j.cantidad > 0;

  IF NOT EXISTS (SELECT 1 FROM @t) THROW 51202, 'No hay materiales para solicitar.', 1;
  IF EXISTS (SELECT 1 FROM @t WHERE Cant <> FLOOR(Cant)) THROW 51206, 'Solo se aceptan cantidades enteras.', 1;
  IF ISNULL(@TipoTrabajo, N'') = N'' THROW 51208, 'Debe seleccionar el tipo de trabajo.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.Importar i WHERE i.IdCliente = @IdCliente AND i.IdProyecto = @IdProyecto
                 AND i.IdSite = @IdSite AND i.Correlativo = @CorreSite AND i.IdEstado = 1)
    THROW 51207, 'La relacion cliente-proyecto-site no existe o no esta activa.', 1;
  IF NOT EXISTS (SELECT 1 FROM dbo.Empleado e WHERE e.IdEmpleado = @IdSolicitante) THROW 51209, 'Debe seleccionar el solicitante.', 1;
  IF ISNULL(@FormaEnvio, 0) = 0 OR ISNULL(@RazonSocial, 0) = 0 OR ISNULL(@Ubigeo, N'') = N'' OR ISNULL(LTRIM(RTRIM(@Direccion)), N'') = N''
    THROW 51210, 'Complete medio de envio, razon social, ubigeo y direccion de entrega.', 1;
  IF ISNULL(@IdConEntrega1, 0) = 0 THROW 51211, 'Debe registrar al menos un responsable de entrega.', 1;
  IF @IdConEntrega2 IS NOT NULL AND @IdConEntrega2 = @IdConEntrega1 THROW 51211, 'Los responsables de entrega deben ser distintos.', 1;

  -- Sin bloqueo por 'procesos culminados' (IdBloqueo): era una regla del sistema antiguo y se retiro a pedido de Logistica.

  IF EXISTS (SELECT 1 FROM @t x WHERE x.Correlativo IS NOT NULL AND NOT EXISTS
             (SELECT 1 FROM dbo.DetLogistica d WHERE d.Correlativo = x.Correlativo AND d.IdEstado = 2 AND CAST(d.CodPap AS nvarchar(50)) = x.CodPap))
    THROW 51204, 'Hay lineas que ya no estan validadas o no corresponden al material. Vuelva a consultar.', 1;
  IF EXISTS (SELECT 1 FROM @t x WHERE x.Correlativo IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.Material m WHERE CAST(m.CodPap AS nvarchar(50)) = x.CodPap))
    THROW 51204, 'Hay materiales que no existen en el catalogo.', 1;
  IF EXISTS (SELECT 1
             FROM (SELECT Correlativo, SUM(Cant) AS Cant FROM @t WHERE Correlativo IS NOT NULL GROUP BY Correlativo) g
             INNER JOIN dbo.DetLogistica d ON d.Correlativo = g.Correlativo
             WHERE g.Cant > d.CantSap - ISNULL((SELECT SUM(ds.CantSap) FROM dbo.DetSolicitud ds
                                                WHERE ds.Correlativo = CONVERT(varchar(36), d.Correlativo)
                                                  AND ds.IdDespacho = 1 AND ds.IdEstado NOT IN (6, 19)), 0))
    THROW 51205, 'La cantidad solicitada supera el saldo de la linea. Vuelva a consultar.', 1;

  -- Estado 9 (x aprobar) si algun material sale de otro site, no tiene linea de origen o es autoportante.
  SET @IdEstado = CASE WHEN EXISTS (SELECT 1 FROM @t x
                                    LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo
                                    LEFT JOIN dbo.Material m ON CAST(m.CodPap AS nvarchar(50)) = x.CodPap
                                    WHERE x.Correlativo IS NULL OR d.IdSite <> @IdSite OR d.CorreSite <> @CorreSite
                                       OR m.NombreMaterial LIKE N'%AUTOPORTANTE%')
                       THEN 9 ELSE 3 END;
  DECLARE @bucketDestino varchar(20) = CASE WHEN @IdEstado = 9 THEN 'Aprobado' ELSE 'Despachado' END;

  DECLARE @nombreCliente nvarchar(200) = (SELECT TOP 1 CAST(NombreCliente AS nvarchar(200)) FROM dbo.Cliente WHERE IdCliente = @IdCliente);
  DECLARE @nombreProyecto nvarchar(200) = (SELECT TOP 1 CAST(NombreProyecto AS nvarchar(200)) FROM dbo.Proyecto WHERE IdProyecto = @IdProyecto);
  DECLARE @pedidoCab nvarchar(50) = ISNULL((SELECT TOP 1 CAST(d.PedidoSap AS nvarchar(50)) FROM @t x
                                            INNER JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo ORDER BY x.Seq), N'');

  BEGIN TRY
    BEGIN TRANSACTION;

    -- Correlativo de solicitudes (Constante CORRELATIVO/1), tomado con bloqueo para evitar duplicados.
    DECLARE @n bigint;
    UPDATE dbo.Constante WITH (UPDLOCK, ROWLOCK)
       SET @n = ISNULL(TRY_CONVERT(bigint, ValorFin), 0) + 1,
           ValorFin = CONVERT(nvarchar(50), ISNULL(TRY_CONVERT(bigint, ValorFin), 0) + 1)
     WHERE Campo = 'CORRELATIVO' AND Correlativo = 1;
    IF @@ROWCOUNT = 0 THROW 51212, 'No existe el correlativo de solicitudes en Constante (CORRELATIVO/1).', 1;
    SET @NroSolicitud = CONVERT(nvarchar(50), @n);

    INSERT INTO dbo.CabSolicitud
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, NroSolicitud, IdSolicitud, ObsSolicitud, Region, Oc, IdZona, NroGuia,
       Observacion, Usuario, FechaCreacion, HoraCreacion, IdEstado, NombreCliente, NombreProyecto, NombreTrabajo,
       FormaEnvio, RazonSocial, Ubigeo, Direccion, Referencia, IdConEntrega1, IdConEntrega2, IdSolicitante, IdMovimiento, IdWeb)
    VALUES
      (@IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, @pedidoCab, @NroSolicitud, '', '', '', '', 0, '',
       '', @Usuario, @hoy, @ahora, @IdEstado, @nombreCliente, @nombreProyecto, @TipoTrabajo,
       @FormaEnvio, @RazonSocial, @Ubigeo, @Direccion, ISNULL(@Referencia, N''), @IdConEntrega1, ISNULL(@IdConEntrega2, 0), @IdSolicitante, 1, 1);  -- IdWeb = 1: solicitud registrada desde la web (CabSolicitud.IdWeb)

    -- Detalle de destino (IdDespacho = 1). Posicion = indice de la fila (0..n-1), como el sistema antiguo.
    INSERT INTO dbo.DetSolicitud
      (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, Correlativo, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
       Usuario, Fecha, Hora, IdEstado, Observacion, NroEnvio, IdClienteOrigen, IdProyectoOrigen, IdSiteOrigen, CorreSiteOrigen,
       TipoTrabajoOrigen, NroSolicitud, Serie, IdDespacho, FechaSolicitud, IdRespSolicitud, FechaAprobar, ImagenSolicitud, CantDesp, IdBloqueo)
    SELECT @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''),
           x.CodPap, CONVERT(varchar(20), x.Seq - 1), x.Cant, '', '', '',
           @Usuario, @hoy, @ahora, @IdEstado, '', 1, ISNULL(d.IdCliente, 0), ISNULL(d.IdProyecto, 0), ISNULL(d.IdSite, '0'), ISNULL(d.CorreSite, 0),
           ISNULL(d.TipoTrabajo, ''), @NroSolicitud, '', 1, @hoy, @IdSolicitante,
           CASE WHEN @IdEstado = 9 THEN CAST('20000101' AS date) ELSE @hoy END, ISNULL(@ImagenSolicitud, ''), x.Cant, 0
    FROM @t x
    LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    -- Fila espejo del site de origen (IdDespacho = 0), solo cuando la solicitud requiere aprobacion.
    IF @IdEstado = 9
      INSERT INTO dbo.DetSolicitud
        (IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, PedidoSap, Correlativo, CodPap, Posicion, CantSap, Centro, Almacen, Lote,
         Usuario, Fecha, Hora, IdEstado, Observacion, NroEnvio, IdClienteOrigen, IdProyectoOrigen, IdSiteOrigen, CorreSiteOrigen,
         TipoTrabajoOrigen, NroSolicitud, Serie, IdDespacho, FechaAprobar, CantDesp, IdBloqueo)
      SELECT ISNULL(d.IdCliente, 0), ISNULL(d.IdProyecto, 0), ISNULL(d.IdSite, '0'), ISNULL(d.CorreSite, 0), @TipoTrabajo,
             ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), x.CodPap, CONVERT(varchar(20), x.Seq - 1), x.Cant, '', '', '',
             @Usuario, @hoy, @ahora, @IdEstado, '', 1, @IdCliente, @IdProyecto, @IdSite, @CorreSite,
             @TipoTrabajo, @NroSolicitud, '', 0, CAST('20000101' AS date), x.Cant, 0
      FROM @t x
      LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    INSERT INTO dbo.MovMaterial
      (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
       IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo, IdSolicitante)
    SELECT ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), CONVERT(varchar(20), x.Seq - 1), @IdEstado, @Usuario, @hoy, @ahora,
           '', x.CodPap, x.Cant, @NroSolicitud, 1, @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo, @IdSolicitante
    FROM @t x LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    IF @IdEstado = 9
      INSERT INTO dbo.MovMaterial
        (PedidoSap, Correlativo, Posicion, IdEstado, Usuario, Fecha, Hora, Observacion, CodPap, CantSap, NroSolicitud, IdMovimiento,
         IdCliente, IdProyecto, IdSite, CorreSite, TipoTrabajo)
      SELECT ISNULL(d.PedidoSap, ''), ISNULL(CONVERT(varchar(36), x.Correlativo), ''), CONVERT(varchar(20), x.Seq - 1), @IdEstado, @Usuario, @hoy, @ahora,
             '', x.CodPap, x.Cant, @NroSolicitud, 2, @IdCliente, @IdProyecto, @IdSite, @CorreSite, @TipoTrabajo
      FROM @t x LEFT JOIN dbo.DetLogistica d ON d.Correlativo = x.Correlativo;

    INSERT INTO dbo.Kardex
      (TipoMovimiento, CantSap, CodPap, CantAnterior, CantRestante, Observaciones, IdCliente, IdProyecto, IdSite, CorreSite,
       IdEmpleadoCj, Fecha, Hora, IdEstado, NroSolicitud, FilaSolicitud, Serie)
    SELECT 3, x.Cant, x.CodPap, 0, 0, 'SOLICITUD', @IdCliente, @IdProyecto, @IdSite, @CorreSite,
           @IdEmpleadoCj, @hoy, @ahora, 3, @NroSolicitud, x.Seq - 1, ''
    FROM @t x;

    -- Stock: Disponible -> Aprobado (x aprobar) o Disponible -> Despachado (sin aprobacion). Falla si no alcanza (51001).
    DECLARE @i int = 1, @max int = (SELECT MAX(Seq) FROM @t);
    DECLARE @cod nvarchar(50), @cant decimal(18,4), @corr nvarchar(50), @clave nvarchar(100), @pos nvarchar(50);
    WHILE @i <= @max
    BEGIN
      SELECT @cod = CodPap, @cant = Cant, @corr = CONVERT(nvarchar(50), Correlativo) FROM @t WHERE Seq = @i;
      SET @pos = CAST(@i - 1 AS nvarchar(50));
      SET @clave = CONCAT(N'SOLICITAR:', @NroSolicitud, N'|', @pos);
      EXEC dbo.sp_Stock_Mover
        @CodPap = @cod, @BucketOrigen = 'Disponible', @BucketDestino = @bucketDestino, @Cantidad = @cant,
        @Operacion = 'SOLICITAR', @NroSolicitud = @NroSolicitud, @Posicion = @pos, @CorrelativoDet = @corr,
        @IdEstadoDoc = @IdEstado, @Usuario = @Usuario, @IdEmpleadoCj = @IdEmpleadoCj, @Observacion = N'Solicitud de equipos',
        @ClaveIdempotencia = @clave;
      SET @i += 1;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
